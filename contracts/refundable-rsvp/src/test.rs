extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, Events as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Bytes, BytesN, Env, MuxedAddress,
};

const NOW: u64 = 1_000;
const START: u64 = 2_000;
const CHECK_IN_DEADLINE: u64 = 2_200;
const END: u64 = 3_000;
const DEPOSIT: i128 = 10;
const INITIAL_BALANCE: i128 = 100;

struct Fixture {
    env: Env,
    contract_id: Address,
    organizer: Address,
    beneficiary: Address,
    attendee_a: Address,
    attendee_b: Address,
    outsider: Address,
    token: Address,
    scanner_signing_key: SigningKey,
}

impl Fixture {
    fn new() -> Self {
        let env = test_env();
        env.ledger().set_timestamp(NOW);
        env.mock_all_auths();

        let organizer = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let attendee_a = Address::generate(&env);
        let attendee_b = Address::generate(&env);
        let outsider = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin);
        let token = sac.address();
        let token_admin_client = StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&attendee_a, &INITIAL_BALANCE);
        token_admin_client.mint(&attendee_b, &INITIAL_BALANCE);
        let contract_id = env.register(RefundableRsvp, RefundableRsvpArgs::__constructor(&token));
        let scanner_signing_key = SigningKey::from_bytes(&[42; 32]);

        Self {
            env,
            contract_id,
            organizer,
            beneficiary,
            attendee_a,
            attendee_b,
            outsider,
            token,
            scanner_signing_key,
        }
    }

    fn client(&self) -> RefundableRsvpClient<'_> {
        RefundableRsvpClient::new(&self.env, &self.contract_id)
    }

    fn config(
        &self,
        policy: CancellationPolicy,
        capacity: u32,
        beneficiary: Option<Address>,
    ) -> EventConfig {
        EventConfig {
            event_salt: bytes(&self.env, 98),
            metadata_hash: bytes(&self.env, 99),
            start_at: START,
            check_in_deadline: CHECK_IN_DEADLINE,
            end_at: END,
            token: self.token.clone(),
            deposit_amount: DEPOSIT,
            capacity,
            no_show_beneficiary: beneficiary,
            cancellation_policy: policy,
            scanner_public_key: BytesN::from_array(
                &self.env,
                &self.scanner_signing_key.verifying_key().to_bytes(),
            ),
        }
    }

    fn create(
        &self,
        salt_value: u8,
        policy: CancellationPolicy,
        capacity: u32,
        beneficiary: Option<Address>,
    ) -> RsvpEvent {
        let mut config = self.config(policy, capacity, beneficiary);
        config.event_salt = bytes(&self.env, salt_value);
        self.client().create_event(&self.organizer, &config)
    }

    fn token_client(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.token)
    }

    fn transfer_token(&self, from: &Address, to: &Address, amount: i128) {
        let destination = MuxedAddress::from(to.clone());
        self.token_client().transfer(from, &destination, &amount);
    }

    fn voucher(
        &self,
        event_id: &BytesN<32>,
        attendee: &Address,
        nonce_value: u8,
        checked_in_at: u64,
        expires_at: u64,
    ) -> CheckInVoucher {
        CheckInVoucher {
            event_id: event_id.clone(),
            attendee: attendee.clone(),
            nonce: bytes(&self.env, nonce_value),
            checked_in_at,
            expires_at,
        }
    }

    fn sign_voucher(&self, voucher: &CheckInVoucher) -> BytesN<64> {
        self.sign_message(
            &self.client().voucher_message(voucher),
            &self.scanner_signing_key,
        )
    }

    fn sign_message(&self, message: &Bytes, signing_key: &SigningKey) -> BytesN<64> {
        let message_bytes: std::vec::Vec<u8> = message.iter().collect();
        let signature = signing_key.sign(&message_bytes);
        BytesN::from_array(&self.env, &signature.to_bytes())
    }
}

fn bytes(env: &Env, value: u8) -> BytesN<32> {
    BytesN::from_array(env, &[value; 32])
}

fn test_env() -> Env {
    Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    })
}

fn assert_only_authorized_by(env: &Env, expected: &Address) {
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(&auths[0].0, expected);
}

#[test]
fn reservation_locks_deposit_and_check_in_refunds_it() {
    let f = Fixture::new();
    let created = f.create(
        1,
        CancellationPolicy::FullRefund,
        10,
        Some(f.beneficiary.clone()),
    );
    let event_id = created.event_id.clone();
    assert_eq!(created.no_show_beneficiary, f.beneficiary);
    assert_eq!(created.seats_reserved, 0);
    assert_eq!(created.outstanding_deposits, 0);

    let reservation = f.client().reserve(&event_id, &f.attendee_a);
    assert_eq!(reservation.status, ReservationStatus::Reserved);
    assert_eq!(
        f.token_client().balance(&f.attendee_a),
        INITIAL_BALANCE - DEPOSIT
    );
    assert_eq!(f.token_client().balance(&f.contract_id), DEPOSIT);

    let event = f.client().get_event(&event_id);
    assert_eq!(event.seats_reserved, 1);
    assert_eq!(event.outstanding_deposits, 1);

    f.env.ledger().set_timestamp(START);
    let voucher = f.voucher(&event_id, &f.attendee_a, 1, START, CHECK_IN_DEADLINE);
    let signature = f.sign_voucher(&voucher);
    let checked_in =
        f.client()
            .claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &signature);
    assert_eq!(checked_in.status, ReservationStatus::CheckedIn);
    assert_eq!(checked_in.settled_at, Some(START));
    let contract_events = f.env.events().all().filter_by_contract(&f.contract_id);
    assert_eq!(contract_events.events().len(), 1);
    assert_eq!(f.token_client().balance(&f.attendee_a), INITIAL_BALANCE);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
    assert_eq!(f.client().get_event(&event_id).outstanding_deposits, 0);
    assert_eq!(
        f.client()
            .try_claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &signature),
        Err(Ok(RsvpError::VoucherAlreadyUsed))
    );
}

#[test]
fn reservation_is_unique_capacity_bounded_and_closes_at_start() {
    let f = Fixture::new();
    let event_id = f
        .create(
            2,
            CancellationPolicy::FullRefund,
            1,
            Some(f.beneficiary.clone()),
        )
        .event_id;

    f.client().reserve(&event_id, &f.attendee_a);
    assert_eq!(
        f.client().try_reserve(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::AlreadyReserved))
    );
    assert_eq!(
        f.client().try_reserve(&event_id, &f.attendee_b),
        Err(Ok(RsvpError::CapacityReached))
    );

    f.env.ledger().set_timestamp(START);
    assert_eq!(
        f.client().try_reserve(&event_id, &f.attendee_b),
        Err(Ok(RsvpError::ReservationClosed))
    );
}

#[test]
fn one_contract_isolates_multiple_events_for_the_same_attendee() {
    let f = Fixture::new();
    let event_a = f
        .create(27, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    let event_b = f
        .create(28, CancellationPolicy::FullRefund, 1, None)
        .event_id;

    f.client().reserve(&event_a, &f.attendee_a);
    f.client().reserve(&event_b, &f.attendee_a);
    assert_eq!(
        f.token_client().balance(&f.attendee_a),
        INITIAL_BALANCE - (2 * DEPOSIT)
    );
    assert_eq!(f.token_client().balance(&f.contract_id), 2 * DEPOSIT);

    f.client().cancel_reservation(&event_a, &f.attendee_a);
    assert_eq!(
        f.client().get_reservation(&event_a, &f.attendee_a).status,
        ReservationStatus::AttendeeRefunded
    );
    assert_eq!(
        f.client().get_reservation(&event_b, &f.attendee_a).status,
        ReservationStatus::Reserved
    );
    assert_eq!(f.client().get_event(&event_a).outstanding_deposits, 0);
    assert_eq!(f.client().get_event(&event_b).outstanding_deposits, 1);
    assert_eq!(f.token_client().balance(&f.contract_id), DEPOSIT);
}

#[test]
fn full_refund_cancellation_returns_deposit_and_frees_capacity() {
    let f = Fixture::new();
    let event_id = f
        .create(
            3,
            CancellationPolicy::FullRefund,
            1,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);

    let cancelled = f.client().cancel_reservation(&event_id, &f.attendee_a);
    assert_eq!(cancelled.status, ReservationStatus::AttendeeRefunded);
    assert_eq!(f.token_client().balance(&f.attendee_a), INITIAL_BALANCE);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
    let event = f.client().get_event(&event_id);
    assert_eq!(event.seats_reserved, 0);
    assert_eq!(event.outstanding_deposits, 0);

    f.client().reserve(&event_id, &f.attendee_b);
    assert_eq!(
        f.client().try_cancel_reservation(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::InvalidReservationStatus))
    );
}

#[test]
fn forfeit_policy_pays_beneficiary_on_attendee_cancellation() {
    let f = Fixture::new();
    let event_id = f
        .create(
            4,
            CancellationPolicy::ForfeitDeposit,
            1,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);

    let cancelled = f.client().cancel_reservation(&event_id, &f.attendee_a);
    assert_eq!(cancelled.status, ReservationStatus::AttendeeForfeited);
    assert_eq!(
        f.token_client().balance(&f.attendee_a),
        INITIAL_BALANCE - DEPOSIT
    );
    assert_eq!(f.token_client().balance(&f.beneficiary), DEPOSIT);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
}

#[test]
fn attendee_cancellation_is_closed_at_start() {
    let f = Fixture::new();
    let event_id = f
        .create(
            5,
            CancellationPolicy::FullRefund,
            1,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);
    f.env.ledger().set_timestamp(START);

    assert_eq!(
        f.client().try_cancel_reservation(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::CancellationClosed))
    );
    assert_eq!(
        f.client().get_reservation(&event_id, &f.attendee_a).status,
        ReservationStatus::Reserved
    );
    assert_eq!(f.token_client().balance(&f.contract_id), DEPOSIT);
}

#[test]
fn organizer_cancellation_enables_pull_refunds_without_double_settlement() {
    let f = Fixture::new();
    let event_id = f
        .create(
            6,
            CancellationPolicy::ForfeitDeposit,
            2,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);
    f.client().reserve(&event_id, &f.attendee_b);

    assert_eq!(
        f.client().try_cancel_event(&event_id, &f.outsider),
        Err(Ok(RsvpError::Unauthorized))
    );
    f.env.ledger().set_timestamp(CHECK_IN_DEADLINE);
    let cancelled = f.client().cancel_event(&event_id, &f.organizer);
    assert_eq!(cancelled.status, EventStatus::Cancelled);
    assert_eq!(cancelled.outstanding_deposits, 2);
    assert_eq!(
        f.client().try_reserve(&event_id, &f.outsider),
        Err(Ok(RsvpError::EventNotActive))
    );
    assert_eq!(
        f.client().try_sweep_no_show(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::EventNotActive))
    );

    let refund_a = f.client().claim_event_refund(&event_id, &f.attendee_a);
    let refund_b = f.client().claim_event_refund(&event_id, &f.attendee_b);
    assert_eq!(refund_a.status, ReservationStatus::EventRefunded);
    assert_eq!(refund_b.status, ReservationStatus::EventRefunded);
    assert_eq!(f.token_client().balance(&f.attendee_a), INITIAL_BALANCE);
    assert_eq!(f.token_client().balance(&f.attendee_b), INITIAL_BALANCE);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
    let event = f.client().get_event(&event_id);
    assert_eq!(event.outstanding_deposits, 0);
    assert_eq!(event.seats_reserved, 0);

    assert_eq!(
        f.client().try_claim_event_refund(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::InvalidReservationStatus))
    );
}

#[test]
fn sensitive_actions_require_the_expected_authorizer() {
    let f = Fixture::new();
    let attendee_cancel_event = f
        .create(29, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    assert_only_authorized_by(&f.env, &f.organizer);
    let check_in_event = f
        .create(30, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    let organizer_cancel_event = f
        .create(31, CancellationPolicy::FullRefund, 1, None)
        .event_id;

    f.client().reserve(&attendee_cancel_event, &f.attendee_a);
    assert_only_authorized_by(&f.env, &f.attendee_a);
    f.client()
        .cancel_reservation(&attendee_cancel_event, &f.attendee_a);
    assert_only_authorized_by(&f.env, &f.attendee_a);

    let replacement_key = SigningKey::from_bytes(&[41; 32]);
    let replacement_public =
        BytesN::from_array(&f.env, &replacement_key.verifying_key().to_bytes());
    f.client()
        .update_scanner_key(&attendee_cancel_event, &f.organizer, &replacement_public);
    assert_only_authorized_by(&f.env, &f.organizer);

    f.client().reserve(&check_in_event, &f.attendee_a);
    f.client().reserve(&organizer_cancel_event, &f.attendee_b);
    f.client()
        .cancel_event(&organizer_cancel_event, &f.organizer);
    assert_only_authorized_by(&f.env, &f.organizer);
    f.client()
        .claim_event_refund(&organizer_cancel_event, &f.attendee_b);
    assert_only_authorized_by(&f.env, &f.attendee_b);

    f.env.ledger().set_timestamp(START);
    let voucher = f.voucher(&check_in_event, &f.attendee_a, 32, START, CHECK_IN_DEADLINE);
    let signature = f.sign_voucher(&voucher);
    f.client()
        .claim_check_in_refund(&check_in_event, &f.attendee_a, &voucher, &signature);
    assert_only_authorized_by(&f.env, &f.attendee_a);
}

#[test]
fn checked_in_reservation_cannot_claim_again_after_event_cancellation() {
    let f = Fixture::new();
    let event_id = f
        .create(
            7,
            CancellationPolicy::FullRefund,
            2,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);
    f.client().reserve(&event_id, &f.attendee_b);
    f.env.ledger().set_timestamp(START);
    let voucher = f.voucher(&event_id, &f.attendee_a, 2, START, CHECK_IN_DEADLINE);
    let signature = f.sign_voucher(&voucher);
    f.client()
        .claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &signature);
    f.client().cancel_event(&event_id, &f.organizer);

    assert_eq!(
        f.client().try_claim_event_refund(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::InvalidReservationStatus))
    );
    f.client().claim_event_refund(&event_id, &f.attendee_b);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
}

#[test]
fn no_show_sweep_is_time_gated_permissionless_and_irreversible() {
    let f = Fixture::new();
    let event_id = f
        .create(
            8,
            CancellationPolicy::FullRefund,
            1,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);

    f.env.ledger().set_timestamp(CHECK_IN_DEADLINE + 1);
    let voucher = f.voucher(
        &event_id,
        &f.attendee_a,
        3,
        CHECK_IN_DEADLINE,
        CHECK_IN_DEADLINE,
    );
    let signature = f.sign_voucher(&voucher);
    assert_eq!(
        f.client()
            .try_claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &signature),
        Err(Ok(RsvpError::CheckInClosed))
    );
    assert_eq!(
        f.client().try_sweep_no_show(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::EventNotEnded))
    );
    assert_eq!(
        f.client().try_cancel_event(&event_id, &f.organizer),
        Err(Ok(RsvpError::EventCancellationClosed))
    );

    f.env.ledger().set_timestamp(END);
    let swept = f.client().sweep_no_show(&event_id, &f.attendee_a);
    assert_eq!(swept.status, ReservationStatus::NoShow);
    assert_eq!(f.token_client().balance(&f.beneficiary), DEPOSIT);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
    assert_eq!(
        f.client().try_sweep_no_show(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::InvalidReservationStatus))
    );
    assert_eq!(
        f.client().try_cancel_event(&event_id, &f.organizer),
        Err(Ok(RsvpError::EventCancellationClosed))
    );
}

#[test]
fn beneficiary_defaults_to_organizer() {
    let f = Fixture::new();
    let event = f.create(9, CancellationPolicy::FullRefund, 1, None);
    let event_id = event.event_id.clone();
    assert_eq!(event.no_show_beneficiary, f.organizer);
    f.client().reserve(&event_id, &f.attendee_a);
    f.env.ledger().set_timestamp(END);
    f.client().sweep_no_show(&event_id, &f.attendee_a);
    assert_eq!(f.token_client().balance(&f.organizer), DEPOSIT);
}

#[test]
fn event_creation_validates_schedule_amount_capacity_and_uniqueness() {
    let f = Fixture::new();
    let client = f.client();

    let mut invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.start_at = NOW;
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidSchedule))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.check_in_deadline = START - 1;
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidSchedule))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.end_at = CHECK_IN_DEADLINE;
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidSchedule))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.deposit_amount = 0;
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidDeposit))
    );
    invalid.deposit_amount = -1;
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidDeposit))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 0, None);
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidCapacity))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.event_salt = BytesN::from_array(&f.env, &[0; 32]);
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidEventSalt))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.token = Address::generate(&f.env);
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::UnsupportedToken))
    );

    invalid = f.config(CancellationPolicy::FullRefund, 1, None);
    invalid.scanner_public_key = BytesN::from_array(&f.env, &[0; 32]);
    assert_eq!(
        client.try_create_event(&f.organizer, &invalid),
        Err(Ok(RsvpError::InvalidScannerKey))
    );

    let mut valid = f.config(CancellationPolicy::FullRefund, 1, None);
    valid.event_salt = bytes(&f.env, 16);
    let event = client.create_event(&f.organizer, &valid);
    assert_eq!(event.event_id, client.derive_event_id(&f.organizer, &valid));
    assert_eq!(
        client.try_create_event(&f.organizer, &valid),
        Err(Ok(RsvpError::EventAlreadyExists))
    );
}

#[test]
fn organizer_bound_event_ids_prevent_cross_organizer_squatting() {
    let f = Fixture::new();
    let mut config = f.config(CancellationPolicy::FullRefund, 1, None);
    config.event_salt = bytes(&f.env, 77);

    let intended_id = f.client().derive_event_id(&f.organizer, &config);
    let attacker_id = f.client().derive_event_id(&f.outsider, &config);
    assert_ne!(attacker_id, intended_id);

    // Even when a different organizer creates first with the exact same config and salt,
    // their event occupies a different, organizer-bound ID.
    let attacker_event = f.client().create_event(&f.outsider, &config);
    assert_eq!(attacker_event.event_id, attacker_id);
    assert!(!f.client().has_event(&intended_id));

    let intended_event = f.client().create_event(&f.organizer, &config);
    assert_eq!(intended_event.event_id, intended_id);
    assert_eq!(intended_event.organizer, f.organizer);

    let mut changed_config = config.clone();
    changed_config.capacity = 2;
    assert_ne!(
        f.client().derive_event_id(&f.organizer, &changed_config),
        intended_id
    );
}

#[test]
fn constructor_pins_the_only_supported_deposit_token() {
    let f = Fixture::new();
    assert_eq!(f.client().get_deposit_token(), f.token);

    let mut foreign_config = f.config(CancellationPolicy::FullRefund, 1, None);
    foreign_config.event_salt = bytes(&f.env, 78);
    foreign_config.token = Address::generate(&f.env);
    let rejected_id = f.client().derive_event_id(&f.organizer, &foreign_config);

    assert_eq!(
        f.client().try_create_event(&f.organizer, &foreign_config),
        Err(Ok(RsvpError::UnsupportedToken))
    );
    assert!(!f.client().has_event(&rejected_id));
}

#[test]
fn scanner_key_rotates_before_start_and_is_frozen_during_check_in() {
    let f = Fixture::new();
    let event_id = f
        .create(23, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    let replacement = SigningKey::from_bytes(&[7; 32]);
    let replacement_public = BytesN::from_array(&f.env, &replacement.verifying_key().to_bytes());

    assert_eq!(
        f.client()
            .try_update_scanner_key(&event_id, &f.outsider, &replacement_public),
        Err(Ok(RsvpError::Unauthorized))
    );
    assert_eq!(
        f.client().try_update_scanner_key(
            &event_id,
            &f.organizer,
            &BytesN::from_array(&f.env, &[0; 32])
        ),
        Err(Ok(RsvpError::InvalidScannerKey))
    );

    let updated = f
        .client()
        .update_scanner_key(&event_id, &f.organizer, &replacement_public);
    assert_eq!(updated.scanner_public_key, replacement_public);

    f.env.ledger().set_timestamp(START);
    assert_eq!(
        f.client()
            .try_update_scanner_key(&event_id, &f.organizer, &bytes(&f.env, 8)),
        Err(Ok(RsvpError::ScannerKeyFrozen))
    );
}

#[test]
fn voucher_is_bound_to_attendee_event_contract_network_and_scanner_key() {
    let f = Fixture::new();
    let event_id = f
        .create(24, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);
    f.env.ledger().set_timestamp(START);

    let wrong_attendee = f.voucher(&event_id, &f.attendee_b, 60, START, CHECK_IN_DEADLINE);
    assert_eq!(
        f.client().try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &wrong_attendee,
            &BytesN::from_array(&f.env, &[0; 64])
        ),
        Err(Ok(RsvpError::VoucherMismatch))
    );

    let wrong_event = f.voucher(
        &bytes(&f.env, 25),
        &f.attendee_a,
        61,
        START,
        CHECK_IN_DEADLINE,
    );
    assert_eq!(
        f.client().try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &wrong_event,
            &BytesN::from_array(&f.env, &[0; 64])
        ),
        Err(Ok(RsvpError::VoucherMismatch))
    );

    let voucher = f.voucher(&event_id, &f.attendee_a, 62, START, CHECK_IN_DEADLINE);
    let wrong_key = SigningKey::from_bytes(&[9; 32]);
    let wrong_key_signature = f.sign_message(&f.client().voucher_message(&voucher), &wrong_key);
    // `ed25519_verify` deliberately raises a host crypto error on an invalid signature.
    assert!(f
        .client()
        .try_claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &wrong_key_signature)
        .is_err());
    assert_eq!(
        f.client().get_reservation(&event_id, &f.attendee_a).status,
        ReservationStatus::Reserved
    );
    assert!(!f.client().is_nonce_used(&event_id, &voucher.nonce));

    let wrong_contract_id = f
        .env
        .register(RefundableRsvp, RefundableRsvpArgs::__constructor(&f.token));
    let wrong_contract_client = RefundableRsvpClient::new(&f.env, &wrong_contract_id);
    let contract_bound_voucher = f.voucher(&event_id, &f.attendee_a, 63, START, CHECK_IN_DEADLINE);
    let wrong_contract_message = wrong_contract_client.voucher_message(&contract_bound_voucher);
    let wrong_contract_signature = f.sign_message(&wrong_contract_message, &f.scanner_signing_key);
    assert!(f
        .client()
        .try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &contract_bound_voucher,
            &wrong_contract_signature
        )
        .is_err());
    assert!(!f
        .client()
        .is_nonce_used(&event_id, &contract_bound_voucher.nonce));

    let network_bound_voucher = f.voucher(&event_id, &f.attendee_a, 64, START, CHECK_IN_DEADLINE);
    let original_network_message = f.client().voucher_message(&network_bound_voucher);
    let original_network_signature =
        f.sign_message(&original_network_message, &f.scanner_signing_key);
    f.env.ledger().set_network_id([1; 32]);
    assert!(f
        .client()
        .try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &network_bound_voucher,
            &original_network_signature
        )
        .is_err());
    f.env.ledger().set_network_id([0; 32]);
    assert!(!f
        .client()
        .is_nonce_used(&event_id, &network_bound_voucher.nonce));
}

#[test]
fn voucher_and_event_windows_reject_early_future_and_expired_claims() {
    let f = Fixture::new();
    let event_id = f
        .create(26, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);

    let early = f.voucher(&event_id, &f.attendee_a, 70, START, CHECK_IN_DEADLINE);
    let early_signature = f.sign_voucher(&early);
    f.env.ledger().set_timestamp(START - 1);
    assert_eq!(
        f.client()
            .try_claim_check_in_refund(&event_id, &f.attendee_a, &early, &early_signature),
        Err(Ok(RsvpError::CheckInNotOpen))
    );

    f.env.ledger().set_timestamp(START + 20);
    let expired = f.voucher(&event_id, &f.attendee_a, 71, START, START + 10);
    let expired_signature = f.sign_voucher(&expired);
    assert_eq!(
        f.client().try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &expired,
            &expired_signature
        ),
        Err(Ok(RsvpError::VoucherExpired))
    );

    let future = f.voucher(&event_id, &f.attendee_a, 72, START + 21, START + 30);
    let future_signature = f.sign_voucher(&future);
    assert_eq!(
        f.client()
            .try_claim_check_in_refund(&event_id, &f.attendee_a, &future, &future_signature),
        Err(Ok(RsvpError::InvalidVoucherTime))
    );

    let too_long = f.voucher(&event_id, &f.attendee_a, 73, START, CHECK_IN_DEADLINE + 1);
    let too_long_signature = f.sign_voucher(&too_long);
    assert_eq!(
        f.client().try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &too_long,
            &too_long_signature
        ),
        Err(Ok(RsvpError::InvalidVoucherTime))
    );
    assert_eq!(
        f.client().get_reservation(&event_id, &f.attendee_a).status,
        ReservationStatus::Reserved
    );
}

#[test]
fn missing_records_and_wrong_lifecycle_calls_return_domain_errors() {
    let f = Fixture::new();
    let missing = bytes(&f.env, 17);
    assert!(!f.client().has_event(&missing));
    assert_eq!(
        f.client().try_get_event(&missing),
        Err(Ok(RsvpError::EventNotFound))
    );

    let event_id = f
        .create(18, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    assert!(!f.client().has_reservation(&event_id, &f.attendee_a));
    assert_eq!(
        f.client().try_get_reservation(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::ReservationNotFound))
    );
    assert_eq!(
        f.client().try_claim_event_refund(&event_id, &f.attendee_a),
        Err(Ok(RsvpError::EventNotCancelled))
    );
    assert_eq!(
        f.client().try_claim_check_in_refund(
            &event_id,
            &f.attendee_a,
            &f.voucher(&event_id, &f.attendee_a, 4, START, CHECK_IN_DEADLINE),
            &BytesN::from_array(&f.env, &[0; 64])
        ),
        Err(Ok(RsvpError::CheckInNotOpen))
    );
}

#[test]
fn failed_token_transfer_rolls_back_reservation_and_event_counts() {
    let f = Fixture::new();
    let event_id = f
        .create(19, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    let unfunded_attendee = Address::generate(&f.env);

    assert!(f
        .client()
        .try_reserve(&event_id, &unfunded_attendee)
        .is_err());
    assert!(!f.client().has_reservation(&event_id, &unfunded_attendee));
    let event = f.client().get_event(&event_id);
    assert_eq!(event.seats_reserved, 0);
    assert_eq!(event.outstanding_deposits, 0);
    assert_eq!(f.token_client().balance(&f.contract_id), 0);
}

#[test]
fn failed_check_in_payout_rolls_back_state_nonce_and_accounting() {
    let f = Fixture::new();
    let event_id = f
        .create(79, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);

    // Simulate an externally induced custody shortfall, then prove the failed outgoing token
    // call rolls back every preceding contract write.
    f.transfer_token(&f.contract_id, &f.attendee_b, DEPOSIT);
    f.env.ledger().set_timestamp(START);
    let voucher = f.voucher(&event_id, &f.attendee_a, 79, START, CHECK_IN_DEADLINE);
    let signature = f.sign_voucher(&voucher);
    assert!(f
        .client()
        .try_claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &signature)
        .is_err());

    assert_eq!(
        f.client().get_reservation(&event_id, &f.attendee_a).status,
        ReservationStatus::Reserved
    );
    assert_eq!(f.client().get_event(&event_id).outstanding_deposits, 1);
    assert!(!f.client().is_nonce_used(&event_id, &voucher.nonce));
    assert_eq!(f.token_client().balance(&f.contract_id), 0);

    f.transfer_token(&f.attendee_b, &f.contract_id, DEPOSIT);
    let settled = f
        .client()
        .claim_check_in_refund(&event_id, &f.attendee_a, &voucher, &signature);
    assert_eq!(settled.status, ReservationStatus::CheckedIn);
    assert!(f.client().is_nonce_used(&event_id, &voucher.nonce));
}

#[test]
fn failed_no_show_payout_rolls_back_terminal_state_and_accounting() {
    let f = Fixture::new();
    let event_id = f
        .create(
            80,
            CancellationPolicy::FullRefund,
            1,
            Some(f.beneficiary.clone()),
        )
        .event_id;
    f.client().reserve(&event_id, &f.attendee_a);
    f.transfer_token(&f.contract_id, &f.attendee_b, DEPOSIT);
    f.env.ledger().set_timestamp(END);

    assert!(f
        .client()
        .try_sweep_no_show(&event_id, &f.attendee_a)
        .is_err());
    assert_eq!(
        f.client().get_reservation(&event_id, &f.attendee_a).status,
        ReservationStatus::Reserved
    );
    assert_eq!(f.client().get_event(&event_id).outstanding_deposits, 1);
    assert_eq!(f.token_client().balance(&f.beneficiary), 0);

    f.transfer_token(&f.attendee_b, &f.contract_id, DEPOSIT);
    let settled = f.client().sweep_no_show(&event_id, &f.attendee_a);
    assert_eq!(settled.status, ReservationStatus::NoShow);
    assert_eq!(f.token_client().balance(&f.beneficiary), DEPOSIT);
}

#[test]
fn every_sensitive_method_fails_without_real_authorization() {
    let f = Fixture::new();
    let mut create_config = f.config(CancellationPolicy::FullRefund, 1, None);
    create_config.event_salt = bytes(&f.env, 81);
    let create_event_id = f.client().derive_event_id(&f.organizer, &create_config);

    f.env.set_auths(&[]);
    assert!(matches!(
        f.client().try_create_event(&f.organizer, &create_config),
        Err(Err(_))
    ));
    assert!(!f.client().has_event(&create_event_id));

    f.env.mock_all_auths();
    let attendee_cancel_event = f.client().create_event(&f.organizer, &create_config);
    let attendee_cancel_id = attendee_cancel_event.event_id;

    f.env.set_auths(&[]);
    assert!(matches!(
        f.client().try_reserve(&attendee_cancel_id, &f.attendee_a),
        Err(Err(_))
    ));
    assert!(!f
        .client()
        .has_reservation(&attendee_cancel_id, &f.attendee_a));

    f.env.mock_all_auths();
    f.client().reserve(&attendee_cancel_id, &f.attendee_a);
    let replacement = SigningKey::from_bytes(&[82; 32]);
    let replacement_public = BytesN::from_array(&f.env, &replacement.verifying_key().to_bytes());

    f.env.set_auths(&[]);
    assert!(matches!(
        f.client()
            .try_update_scanner_key(&attendee_cancel_id, &f.organizer, &replacement_public),
        Err(Err(_))
    ));
    assert_eq!(
        f.client().get_event(&attendee_cancel_id).scanner_public_key,
        create_config.scanner_public_key
    );
    assert!(matches!(
        f.client()
            .try_cancel_reservation(&attendee_cancel_id, &f.attendee_a),
        Err(Err(_))
    ));
    assert_eq!(
        f.client()
            .get_reservation(&attendee_cancel_id, &f.attendee_a)
            .status,
        ReservationStatus::Reserved
    );

    f.env.mock_all_auths();
    f.client()
        .cancel_reservation(&attendee_cancel_id, &f.attendee_a);
    let organizer_cancel_id = f
        .create(83, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    let check_in_id = f
        .create(84, CancellationPolicy::FullRefund, 1, None)
        .event_id;
    f.client().reserve(&organizer_cancel_id, &f.attendee_b);
    f.client().reserve(&check_in_id, &f.attendee_a);

    f.env.set_auths(&[]);
    assert!(matches!(
        f.client()
            .try_cancel_event(&organizer_cancel_id, &f.organizer),
        Err(Err(_))
    ));
    assert_eq!(
        f.client().get_event(&organizer_cancel_id).status,
        EventStatus::Active
    );

    f.env.mock_all_auths();
    f.client().cancel_event(&organizer_cancel_id, &f.organizer);
    f.env.set_auths(&[]);
    assert!(matches!(
        f.client()
            .try_claim_event_refund(&organizer_cancel_id, &f.attendee_b),
        Err(Err(_))
    ));
    assert_eq!(
        f.client()
            .get_reservation(&organizer_cancel_id, &f.attendee_b)
            .status,
        ReservationStatus::Reserved
    );

    f.env.mock_all_auths();
    f.client()
        .claim_event_refund(&organizer_cancel_id, &f.attendee_b);
    f.env.ledger().set_timestamp(START);
    let voucher = f.voucher(&check_in_id, &f.attendee_a, 85, START, CHECK_IN_DEADLINE);
    let signature = f.sign_voucher(&voucher);

    f.env.set_auths(&[]);
    assert!(matches!(
        f.client()
            .try_claim_check_in_refund(&check_in_id, &f.attendee_a, &voucher, &signature),
        Err(Err(_))
    ));
    assert_eq!(
        f.client()
            .get_reservation(&check_in_id, &f.attendee_a)
            .status,
        ReservationStatus::Reserved
    );
    assert!(!f.client().is_nonce_used(&check_in_id, &voucher.nonce));
}
