#![no_std]
#![deny(unsafe_code)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    xdr::ToXdr, Address, Bytes, BytesN, Env, MuxedAddress,
};

#[cfg(test)]
mod test;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Event(BytesN<32>),
    Reservation(BytesN<32>, Address),
    VoucherNonce(BytesN<32>, BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum InstanceKey {
    DepositToken,
}

const CHECK_IN_DOMAIN: [u8; 32] = *b"COMMITPASS_CHECKIN_V1\0\0\0\0\0\0\0\0\0\0\0";
const EVENT_ID_DOMAIN: [u8; 32] = *b"COMMITPASS_EVENT_ID_V1\0\0\0\0\0\0\0\0\0\0";

/// Whether an attendee who cancels before the event starts receives their deposit.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CancellationPolicy {
    FullRefund,
    ForfeitDeposit,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EventStatus {
    Active,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReservationStatus {
    Reserved,
    CheckedIn,
    AttendeeRefunded,
    AttendeeForfeited,
    EventRefunded,
    NoShow,
}

/// Immutable configuration supplied when an event is created.
///
/// Reservations close at `start_at`. Check-in is open from `start_at` through
/// `check_in_deadline`, inclusive. Unchecked deposits become sweepable at `end_at`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventConfig {
    /// Organizer-generated, cryptographically random salt unique to this event.
    pub event_salt: BytesN<32>,
    pub metadata_hash: BytesN<32>,
    pub start_at: u64,
    pub check_in_deadline: u64,
    pub end_at: u64,
    pub token: Address,
    pub deposit_amount: i128,
    pub capacity: u32,
    pub no_show_beneficiary: Option<Address>,
    pub cancellation_policy: CancellationPolicy,
    /// Event-scoped Ed25519 public key used by the venue scanner.
    pub scanner_public_key: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RsvpEvent {
    pub event_id: BytesN<32>,
    pub event_salt: BytesN<32>,
    pub organizer: Address,
    pub metadata_hash: BytesN<32>,
    pub start_at: u64,
    pub check_in_deadline: u64,
    pub end_at: u64,
    pub token: Address,
    pub deposit_amount: i128,
    pub capacity: u32,
    /// Seats still associated with non-cancelled reservations.
    pub seats_reserved: u32,
    /// Deposits that remain in contract custody and have not reached a terminal state.
    pub outstanding_deposits: u32,
    pub no_show_beneficiary: Address,
    pub cancellation_policy: CancellationPolicy,
    pub scanner_public_key: BytesN<32>,
    pub status: EventStatus,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reservation {
    pub status: ReservationStatus,
    pub reserved_at: u64,
    pub settled_at: Option<u64>,
}

/// Organizer-attested proof that one attendee was physically checked in.
///
/// The contract adds its own fixed domain, network ID, and contract address before canonical XDR
/// serialization, so a signature cannot be replayed across deployments or Stellar networks.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckInVoucher {
    pub event_id: BytesN<32>,
    pub attendee: Address,
    pub nonce: BytesN<32>,
    pub checked_in_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
struct SignedCheckInPayload {
    domain: BytesN<32>,
    network_id: BytesN<32>,
    contract_id: Address,
    event_id: BytesN<32>,
    attendee: Address,
    nonce: BytesN<32>,
    checked_in_at: u64,
    expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
struct EventIdPreimage {
    domain: BytesN<32>,
    network_id: BytesN<32>,
    contract_id: Address,
    organizer: Address,
    config: EventConfig,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RsvpError {
    EventAlreadyExists = 1,
    EventNotFound = 2,
    ReservationNotFound = 3,
    InvalidSchedule = 4,
    InvalidDeposit = 5,
    InvalidCapacity = 6,
    Unauthorized = 7,
    EventNotActive = 8,
    ReservationClosed = 9,
    CapacityReached = 10,
    AlreadyReserved = 11,
    InvalidReservationStatus = 12,
    CheckInNotOpen = 13,
    CheckInClosed = 14,
    CancellationClosed = 15,
    EventNotCancelled = 16,
    EventNotEnded = 17,
    EventCancellationClosed = 18,
    ArithmeticOverflow = 19,
    InvalidScannerKey = 20,
    ScannerKeyFrozen = 21,
    VoucherMismatch = 22,
    VoucherAlreadyUsed = 23,
    InvalidVoucherTime = 24,
    VoucherExpired = 25,
    InvalidEventSalt = 26,
    UnsupportedToken = 27,
}

#[contractevent(topics = ["rsvp", "event_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventCreated {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub organizer: Address,
    pub event_salt: BytesN<32>,
    pub metadata_hash: BytesN<32>,
    pub token: Address,
    pub deposit_amount: i128,
    pub capacity: u32,
    pub start_at: u64,
    pub check_in_deadline: u64,
    pub end_at: u64,
    pub no_show_beneficiary: Address,
    pub cancellation_policy: CancellationPolicy,
    pub scanner_public_key: BytesN<32>,
}

#[contractevent(topics = ["rsvp", "scanner_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScannerKeyUpdated {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub organizer: Address,
    pub scanner_public_key: BytesN<32>,
}

#[contractevent(topics = ["rsvp", "reserved"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservationCreated {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub attendee: Address,
    pub amount: i128,
    pub seats_reserved: u32,
}

#[contractevent(topics = ["rsvp", "checked_in"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttendeeCheckedIn {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub attendee: Address,
    pub nonce: BytesN<32>,
    pub checked_in_at: u64,
    pub refund_amount: i128,
}

#[contractevent(topics = ["rsvp", "attendee_cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservationCancelled {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub attendee: Address,
    pub attendee_refund: i128,
    pub beneficiary_payment: i128,
}

#[contractevent(topics = ["rsvp", "event_cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventCancelled {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub organizer: Address,
    pub refundable_reservations: u32,
}

#[contractevent(topics = ["rsvp", "event_refund"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventRefundClaimed {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub attendee: Address,
    pub refund_amount: i128,
}

#[contractevent(topics = ["rsvp", "no_show"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoShowSwept {
    #[topic]
    pub event_id: BytesN<32>,
    #[topic]
    pub attendee: Address,
    pub beneficiary: Address,
    pub amount: i128,
}

#[contract]
pub struct RefundableRsvp;

#[contractimpl]
impl RefundableRsvp {
    /// Pin the sole accepted deposit token atomically when this contract instance is deployed.
    pub fn __constructor(env: Env, deposit_token: Address) {
        env.storage()
            .instance()
            .set(&InstanceKey::DepositToken, &deposit_token);
        bump_instance_ttl(&env);
    }

    /// Return the sole token accepted by every event in this deployment.
    pub fn get_deposit_token(env: Env) -> Address {
        bump_instance_ttl(&env);
        deposit_token(&env)
    }

    /// Derive the event ID for this organizer, exact immutable config, network, and deployment.
    pub fn derive_event_id(env: Env, organizer: Address, config: EventConfig) -> BytesN<32> {
        bump_instance_ttl(&env);
        event_id_for(&env, &organizer, &config)
    }

    /// Create an event under its contract-derived ID. The organizer authorizes the exact config.
    pub fn create_event(
        env: Env,
        organizer: Address,
        config: EventConfig,
    ) -> Result<RsvpEvent, RsvpError> {
        bump_instance_ttl(&env);
        validate_config(&env, &config)?;

        let event_id = event_id_for(&env, &organizer, &config);
        let event_key = DataKey::Event(event_id.clone());
        if env.storage().persistent().has(&event_key) {
            return Err(RsvpError::EventAlreadyExists);
        }

        organizer.require_auth();

        let no_show_beneficiary = config
            .no_show_beneficiary
            .clone()
            .unwrap_or_else(|| organizer.clone());
        let event = RsvpEvent {
            event_id: event_id.clone(),
            event_salt: config.event_salt.clone(),
            organizer: organizer.clone(),
            metadata_hash: config.metadata_hash.clone(),
            start_at: config.start_at,
            check_in_deadline: config.check_in_deadline,
            end_at: config.end_at,
            token: config.token.clone(),
            deposit_amount: config.deposit_amount,
            capacity: config.capacity,
            seats_reserved: 0,
            outstanding_deposits: 0,
            no_show_beneficiary: no_show_beneficiary.clone(),
            cancellation_policy: config.cancellation_policy.clone(),
            scanner_public_key: config.scanner_public_key.clone(),
            status: EventStatus::Active,
            created_at: env.ledger().timestamp(),
        };
        save_event(&env, &event_key, &event);

        EventCreated {
            event_id,
            organizer,
            event_salt: config.event_salt,
            metadata_hash: config.metadata_hash,
            token: config.token,
            deposit_amount: config.deposit_amount,
            capacity: config.capacity,
            start_at: config.start_at,
            check_in_deadline: config.check_in_deadline,
            end_at: config.end_at,
            no_show_beneficiary,
            cancellation_policy: config.cancellation_policy,
            scanner_public_key: config.scanner_public_key,
        }
        .publish(&env);

        Ok(event)
    }

    /// Reserve a seat before the event starts and atomically place one deposit in custody.
    pub fn reserve(
        env: Env,
        event_id: BytesN<32>,
        attendee: Address,
    ) -> Result<Reservation, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        require_active(&event)?;
        if env.ledger().timestamp() >= event.start_at {
            return Err(RsvpError::ReservationClosed);
        }

        let reservation_key = DataKey::Reservation(event_id.clone(), attendee.clone());
        if env.storage().persistent().has(&reservation_key) {
            return Err(RsvpError::AlreadyReserved);
        }
        if event.seats_reserved >= event.capacity {
            return Err(RsvpError::CapacityReached);
        }
        attendee.require_auth();

        event.seats_reserved = event
            .seats_reserved
            .checked_add(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        event.outstanding_deposits = event
            .outstanding_deposits
            .checked_add(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        let reservation = Reservation {
            status: ReservationStatus::Reserved,
            reserved_at: env.ledger().timestamp(),
            settled_at: None,
        };

        // Effects are written before the external token call. If the transfer fails, Soroban
        // atomically rolls back both state entries.
        save_event(&env, &event_key, &event);
        save_reservation(&env, &reservation_key, &reservation);
        transfer_to_contract(&env, &event.token, &attendee, event.deposit_amount);

        ReservationCreated {
            event_id,
            attendee,
            amount: event.deposit_amount,
            seats_reserved: event.seats_reserved,
        }
        .publish(&env);

        Ok(reservation)
    }

    /// Rotate the event-scoped scanner key before check-in starts. The key is frozen at
    /// `start_at`, preventing a late organizer key swap from invalidating issued vouchers.
    pub fn update_scanner_key(
        env: Env,
        event_id: BytesN<32>,
        organizer: Address,
        scanner_public_key: BytesN<32>,
    ) -> Result<RsvpEvent, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        require_active(&event)?;
        if organizer != event.organizer {
            return Err(RsvpError::Unauthorized);
        }
        if env.ledger().timestamp() >= event.start_at {
            return Err(RsvpError::ScannerKeyFrozen);
        }
        validate_scanner_key(&env, &scanner_public_key)?;
        organizer.require_auth();

        event.scanner_public_key = scanner_public_key.clone();
        save_event(&env, &event_key, &event);

        ScannerKeyUpdated {
            event_id,
            organizer,
            scanner_public_key,
        }
        .publish(&env);

        Ok(event)
    }

    /// Verify an attendee-bound scanner voucher and atomically return the full deposit.
    ///
    /// Invalid Ed25519 signatures fail the invocation at the host level. The attendee still has
    /// to authorize this call, and the voucher nonce is persisted before the token transfer.
    pub fn claim_check_in_refund(
        env: Env,
        event_id: BytesN<32>,
        attendee: Address,
        voucher: CheckInVoucher,
        signature: BytesN<64>,
    ) -> Result<Reservation, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        require_active(&event)?;

        if voucher.event_id != event_id || voucher.attendee != attendee {
            return Err(RsvpError::VoucherMismatch);
        }
        let nonce_key = DataKey::VoucherNonce(event_id.clone(), voucher.nonce.clone());
        if env.storage().persistent().has(&nonce_key) {
            return Err(RsvpError::VoucherAlreadyUsed);
        }

        let now = env.ledger().timestamp();
        if now < event.start_at {
            return Err(RsvpError::CheckInNotOpen);
        }
        if now > event.check_in_deadline {
            return Err(RsvpError::CheckInClosed);
        }
        if voucher.checked_in_at < event.start_at
            || voucher.checked_in_at > now
            || voucher.checked_in_at > event.check_in_deadline
            || voucher.expires_at < voucher.checked_in_at
            || voucher.expires_at > event.check_in_deadline
        {
            return Err(RsvpError::InvalidVoucherTime);
        }
        if now > voucher.expires_at {
            return Err(RsvpError::VoucherExpired);
        }

        let reservation_key = DataKey::Reservation(event_id.clone(), attendee.clone());
        let mut reservation = load_reservation(&env, &reservation_key)?;
        require_reserved(&reservation)?;
        attendee.require_auth();

        let message = voucher_message(&env, &voucher);
        env.crypto()
            .ed25519_verify(&event.scanner_public_key, &message, &signature);

        reservation.status = ReservationStatus::CheckedIn;
        reservation.settled_at = Some(now);
        event.outstanding_deposits = event
            .outstanding_deposits
            .checked_sub(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        save_event(&env, &event_key, &event);
        save_reservation(&env, &reservation_key, &reservation);
        env.storage().persistent().set(&nonce_key, &true);
        bump_key_ttl(&env, &nonce_key);

        transfer_from_contract(&env, &event.token, &attendee, event.deposit_amount);

        AttendeeCheckedIn {
            event_id,
            attendee,
            nonce: voucher.nonce,
            checked_in_at: voucher.checked_in_at,
            refund_amount: event.deposit_amount,
        }
        .publish(&env);

        Ok(reservation)
    }

    /// Cancel an RSVP before the event starts. The event's immutable policy determines whether
    /// the deposit returns to the attendee or is paid to the no-show beneficiary.
    pub fn cancel_reservation(
        env: Env,
        event_id: BytesN<32>,
        attendee: Address,
    ) -> Result<Reservation, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        require_active(&event)?;
        if env.ledger().timestamp() >= event.start_at {
            return Err(RsvpError::CancellationClosed);
        }

        let reservation_key = DataKey::Reservation(event_id.clone(), attendee.clone());
        let mut reservation = load_reservation(&env, &reservation_key)?;
        require_reserved(&reservation)?;
        attendee.require_auth();

        let now = env.ledger().timestamp();
        event.seats_reserved = event
            .seats_reserved
            .checked_sub(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        event.outstanding_deposits = event
            .outstanding_deposits
            .checked_sub(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;

        let (attendee_refund, beneficiary_payment) = match event.cancellation_policy {
            CancellationPolicy::FullRefund => {
                reservation.status = ReservationStatus::AttendeeRefunded;
                (event.deposit_amount, 0)
            }
            CancellationPolicy::ForfeitDeposit => {
                reservation.status = ReservationStatus::AttendeeForfeited;
                (0, event.deposit_amount)
            }
        };
        reservation.settled_at = Some(now);
        save_event(&env, &event_key, &event);
        save_reservation(&env, &reservation_key, &reservation);

        if attendee_refund > 0 {
            transfer_from_contract(&env, &event.token, &attendee, attendee_refund);
        }
        if beneficiary_payment > 0 {
            transfer_from_contract(
                &env,
                &event.token,
                &event.no_show_beneficiary,
                beneficiary_payment,
            );
        }

        ReservationCancelled {
            event_id,
            attendee,
            attendee_refund,
            beneficiary_payment,
        }
        .publish(&env);

        Ok(reservation)
    }

    /// Cancel the event no later than the check-in deadline. Outstanding attendees claim their
    /// own refunds separately, keeping this operation bounded regardless of event capacity.
    pub fn cancel_event(
        env: Env,
        event_id: BytesN<32>,
        organizer: Address,
    ) -> Result<RsvpEvent, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        require_active(&event)?;
        if organizer != event.organizer {
            return Err(RsvpError::Unauthorized);
        }
        if env.ledger().timestamp() > event.check_in_deadline {
            return Err(RsvpError::EventCancellationClosed);
        }
        organizer.require_auth();

        event.status = EventStatus::Cancelled;
        save_event(&env, &event_key, &event);

        EventCancelled {
            event_id,
            organizer,
            refundable_reservations: event.outstanding_deposits,
        }
        .publish(&env);

        Ok(event)
    }

    /// Claim one deposit after an organizer cancellation. Only the attendee can authorize the
    /// claim, and terminal reservations cannot claim twice.
    pub fn claim_event_refund(
        env: Env,
        event_id: BytesN<32>,
        attendee: Address,
    ) -> Result<Reservation, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        if event.status != EventStatus::Cancelled {
            return Err(RsvpError::EventNotCancelled);
        }

        let reservation_key = DataKey::Reservation(event_id.clone(), attendee.clone());
        let mut reservation = load_reservation(&env, &reservation_key)?;
        require_reserved(&reservation)?;
        attendee.require_auth();

        reservation.status = ReservationStatus::EventRefunded;
        reservation.settled_at = Some(env.ledger().timestamp());
        event.outstanding_deposits = event
            .outstanding_deposits
            .checked_sub(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        event.seats_reserved = event
            .seats_reserved
            .checked_sub(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        save_event(&env, &event_key, &event);
        save_reservation(&env, &reservation_key, &reservation);

        transfer_from_contract(&env, &event.token, &attendee, event.deposit_amount);

        EventRefundClaimed {
            event_id,
            attendee,
            refund_amount: event.deposit_amount,
        }
        .publish(&env);

        Ok(reservation)
    }

    /// Permissionlessly settle one unchecked reservation after the event ends. The caller cannot
    /// redirect funds: the immutable event beneficiary always receives the deposit.
    pub fn sweep_no_show(
        env: Env,
        event_id: BytesN<32>,
        attendee: Address,
    ) -> Result<Reservation, RsvpError> {
        bump_instance_ttl(&env);
        let event_key = DataKey::Event(event_id.clone());
        let mut event = load_event(&env, &event_key)?;
        require_active(&event)?;
        if env.ledger().timestamp() < event.end_at {
            return Err(RsvpError::EventNotEnded);
        }

        let reservation_key = DataKey::Reservation(event_id.clone(), attendee.clone());
        let mut reservation = load_reservation(&env, &reservation_key)?;
        require_reserved(&reservation)?;

        reservation.status = ReservationStatus::NoShow;
        reservation.settled_at = Some(env.ledger().timestamp());
        event.outstanding_deposits = event
            .outstanding_deposits
            .checked_sub(1)
            .ok_or(RsvpError::ArithmeticOverflow)?;
        save_event(&env, &event_key, &event);
        save_reservation(&env, &reservation_key, &reservation);

        transfer_from_contract(
            &env,
            &event.token,
            &event.no_show_beneficiary,
            event.deposit_amount,
        );

        NoShowSwept {
            event_id,
            attendee,
            beneficiary: event.no_show_beneficiary.clone(),
            amount: event.deposit_amount,
        }
        .publish(&env);

        Ok(reservation)
    }

    pub fn get_event(env: Env, event_id: BytesN<32>) -> Result<RsvpEvent, RsvpError> {
        bump_instance_ttl(&env);
        load_event(&env, &DataKey::Event(event_id))
    }

    pub fn get_reservation(
        env: Env,
        event_id: BytesN<32>,
        attendee: Address,
    ) -> Result<Reservation, RsvpError> {
        bump_instance_ttl(&env);
        load_reservation(&env, &DataKey::Reservation(event_id, attendee))
    }

    pub fn has_event(env: Env, event_id: BytesN<32>) -> bool {
        bump_instance_ttl(&env);
        env.storage().persistent().has(&DataKey::Event(event_id))
    }

    pub fn has_reservation(env: Env, event_id: BytesN<32>, attendee: Address) -> bool {
        bump_instance_ttl(&env);
        env.storage()
            .persistent()
            .has(&DataKey::Reservation(event_id, attendee))
    }

    /// Return the exact canonical XDR bytes a scanner signs for this deployment and network.
    pub fn voucher_message(env: Env, voucher: CheckInVoucher) -> Bytes {
        bump_instance_ttl(&env);
        voucher_message(&env, &voucher)
    }

    pub fn is_nonce_used(env: Env, event_id: BytesN<32>, nonce: BytesN<32>) -> bool {
        bump_instance_ttl(&env);
        env.storage()
            .persistent()
            .has(&DataKey::VoucherNonce(event_id, nonce))
    }
}

fn validate_config(env: &Env, config: &EventConfig) -> Result<(), RsvpError> {
    let now = env.ledger().timestamp();
    if config.start_at <= now
        || config.check_in_deadline < config.start_at
        || config.end_at <= config.check_in_deadline
    {
        return Err(RsvpError::InvalidSchedule);
    }
    if config.deposit_amount <= 0 {
        return Err(RsvpError::InvalidDeposit);
    }
    if config.capacity == 0 {
        return Err(RsvpError::InvalidCapacity);
    }
    if config.event_salt == BytesN::from_array(env, &[0; 32]) {
        return Err(RsvpError::InvalidEventSalt);
    }
    if config.token != deposit_token(env) {
        return Err(RsvpError::UnsupportedToken);
    }
    validate_scanner_key(env, &config.scanner_public_key)?;
    Ok(())
}

fn deposit_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&InstanceKey::DepositToken)
        .expect("constructor must set deposit token")
}

fn event_id_for(env: &Env, organizer: &Address, config: &EventConfig) -> BytesN<32> {
    env.crypto()
        .sha256(
            &EventIdPreimage {
                domain: BytesN::from_array(env, &EVENT_ID_DOMAIN),
                network_id: env.ledger().network_id(),
                contract_id: env.current_contract_address(),
                organizer: organizer.clone(),
                config: config.clone(),
            }
            .to_xdr(env),
        )
        .into()
}

fn validate_scanner_key(env: &Env, scanner_public_key: &BytesN<32>) -> Result<(), RsvpError> {
    if scanner_public_key == &BytesN::from_array(env, &[0; 32]) {
        return Err(RsvpError::InvalidScannerKey);
    }
    Ok(())
}

fn voucher_message(env: &Env, voucher: &CheckInVoucher) -> Bytes {
    SignedCheckInPayload {
        domain: BytesN::from_array(env, &CHECK_IN_DOMAIN),
        network_id: env.ledger().network_id(),
        contract_id: env.current_contract_address(),
        event_id: voucher.event_id.clone(),
        attendee: voucher.attendee.clone(),
        nonce: voucher.nonce.clone(),
        checked_in_at: voucher.checked_in_at,
        expires_at: voucher.expires_at,
    }
    .to_xdr(env)
}

fn require_active(event: &RsvpEvent) -> Result<(), RsvpError> {
    if event.status != EventStatus::Active {
        return Err(RsvpError::EventNotActive);
    }
    Ok(())
}

fn require_reserved(reservation: &Reservation) -> Result<(), RsvpError> {
    if reservation.status != ReservationStatus::Reserved {
        return Err(RsvpError::InvalidReservationStatus);
    }
    Ok(())
}

fn load_event(env: &Env, key: &DataKey) -> Result<RsvpEvent, RsvpError> {
    let event = env
        .storage()
        .persistent()
        .get(key)
        .ok_or(RsvpError::EventNotFound)?;
    bump_key_ttl(env, key);
    Ok(event)
}

fn save_event(env: &Env, key: &DataKey, event: &RsvpEvent) {
    env.storage().persistent().set(key, event);
    bump_key_ttl(env, key);
}

fn load_reservation(env: &Env, key: &DataKey) -> Result<Reservation, RsvpError> {
    let reservation = env
        .storage()
        .persistent()
        .get(key)
        .ok_or(RsvpError::ReservationNotFound)?;
    bump_key_ttl(env, key);
    Ok(reservation)
}

fn save_reservation(env: &Env, key: &DataKey, reservation: &Reservation) {
    env.storage().persistent().set(key, reservation);
    bump_key_ttl(env, key);
}

fn transfer_to_contract(env: &Env, token: &Address, from: &Address, amount: i128) {
    let destination = MuxedAddress::from(env.current_contract_address());
    TokenClient::new(env, token).transfer(from, &destination, &amount);
}

fn transfer_from_contract(env: &Env, token: &Address, to: &Address, amount: i128) {
    let destination = MuxedAddress::from(to);
    TokenClient::new(env, token).transfer(&env.current_contract_address(), &destination, &amount);
}

fn bump_instance_ttl(env: &Env) {
    let max_ttl = env.storage().max_ttl();
    if max_ttl > 0 {
        env.storage().instance().extend_ttl(max_ttl / 2, max_ttl);
    }
}

fn bump_key_ttl(env: &Env, key: &DataKey) {
    let max_ttl = env.storage().max_ttl();
    if max_ttl > 0 {
        env.storage()
            .persistent()
            .extend_ttl(key, max_ttl / 2, max_ttl);
    }
}
