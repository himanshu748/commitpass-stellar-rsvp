extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, Events as _, Ledger as _},
    Address, BytesN, Env,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum SourceKey {
    DepositToken,
    Event(BytesN<32>),
}

#[contract]
struct SourceStub;

#[contractimpl]
impl SourceStub {
    pub fn __constructor(env: Env, deposit_token: Address) {
        env.storage()
            .instance()
            .set(&SourceKey::DepositToken, &deposit_token);
    }

    pub fn add_event(env: Env, event_id: BytesN<32>) {
        env.storage()
            .persistent()
            .set(&SourceKey::Event(event_id), &true);
    }

    pub fn has_event(env: Env, event_id: BytesN<32>) -> bool {
        env.storage().persistent().has(&SourceKey::Event(event_id))
    }

    pub fn get_deposit_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&SourceKey::DepositToken)
            .expect("stub constructor sets token")
    }
}

struct Fixture {
    env: Env,
    directory_id: Address,
    source_id: Address,
    deposit_token: Address,
}

impl Fixture {
    fn new() -> Self {
        let env = Env::new_with_config(EnvTestConfig {
            capture_snapshot_at_drop: false,
        });
        env.ledger().set_timestamp(1_782_489_600);
        let deposit_token = Address::generate(&env);
        let source_id = env.register(SourceStub, SourceStubArgs::__constructor(&deposit_token));
        let directory_id = env.register(EventDirectory, ());
        Self {
            env,
            directory_id,
            source_id,
            deposit_token,
        }
    }

    fn client(&self) -> EventDirectoryClient<'_> {
        EventDirectoryClient::new(&self.env, &self.directory_id)
    }

    fn source(&self) -> SourceStubClient<'_> {
        SourceStubClient::new(&self.env, &self.source_id)
    }
}

fn event_id(env: &Env, value: u8) -> BytesN<32> {
    BytesN::from_array(env, &[value; 32])
}

#[test]
fn indexes_only_after_cross_contract_verification() {
    let f = Fixture::new();
    let id = event_id(&f.env, 7);
    f.source().add_event(&id);

    let entry = f.client().index_event(&f.source_id, &id);

    assert_eq!(
        f.env
            .events()
            .all()
            .filter_by_contract(&f.directory_id)
            .events()
            .len(),
        1
    );
    assert_eq!(
        entry,
        EventDirectoryEntry {
            source_contract: f.source_id.clone(),
            event_id: id.clone(),
            deposit_token: f.deposit_token.clone(),
            indexed_at: 1_782_489_600,
        }
    );
    assert!(f.client().has_entry(&f.source_id, &id));
    assert_eq!(f.client().get_entry(&f.source_id, &id), entry);
    assert_eq!(f.client().total_entries(), 1);
}

#[test]
fn rejects_an_event_missing_from_the_source_contract() {
    let f = Fixture::new();
    let id = event_id(&f.env, 8);

    assert_eq!(
        f.client().try_index_event(&f.source_id, &id),
        Err(Ok(DirectoryError::SourceEventNotFound))
    );
    assert!(!f.client().has_entry(&f.source_id, &id));
    assert_eq!(f.client().total_entries(), 0);
}

#[test]
fn reindexing_is_idempotent_and_does_not_emit_twice() {
    let f = Fixture::new();
    let id = event_id(&f.env, 9);
    f.source().add_event(&id);

    let first = f.client().index_event(&f.source_id, &id);
    assert_eq!(
        f.env
            .events()
            .all()
            .filter_by_contract(&f.directory_id)
            .events()
            .len(),
        1
    );
    f.env.ledger().set_timestamp(1_782_576_000);
    let second = f.client().index_event(&f.source_id, &id);

    assert_eq!(second, first);
    assert_eq!(second.indexed_at, 1_782_489_600);
    assert_eq!(f.client().total_entries(), 1);
}

#[test]
fn keeps_contract_and_event_pairs_isolated() {
    let f = Fixture::new();
    let second_token = Address::generate(&f.env);
    let second_source = f
        .env
        .register(SourceStub, SourceStubArgs::__constructor(&second_token));
    let id = event_id(&f.env, 10);
    f.source().add_event(&id);
    SourceStubClient::new(&f.env, &second_source).add_event(&id);

    let first = f.client().index_event(&f.source_id, &id);
    let second = f.client().index_event(&second_source, &id);

    assert_eq!(first.deposit_token, f.deposit_token);
    assert_eq!(second.deposit_token, second_token);
    assert_ne!(first.source_contract, second.source_contract);
    assert_eq!(f.client().total_entries(), 2);
}

#[test]
fn missing_directory_entry_returns_a_typed_error() {
    let f = Fixture::new();
    let id = event_id(&f.env, 11);

    assert_eq!(
        f.client().try_get_entry(&f.source_id, &id),
        Err(Ok(DirectoryError::EntryNotFound))
    );
}
