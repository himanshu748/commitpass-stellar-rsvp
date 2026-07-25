#![no_std]
#![deny(unsafe_code)]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, Address,
    BytesN, Env,
};

#[cfg(test)]
mod test;

/// Minimal source interface used for inter-contract verification.
///
/// The directory deliberately depends only on stable read methods rather than
/// importing a particular RSVP Wasm build. Any compatible source contract can
/// therefore be indexed, while a non-contract or incompatible contract fails
/// atomically at the host boundary.
#[contractclient(name = "RsvpSourceClient")]
pub trait RsvpSource {
    fn has_event(env: Env, event_id: BytesN<32>) -> bool;
    fn get_deposit_token(env: Env) -> Address;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Entry(Address, BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum InstanceKey {
    TotalEntries,
}

/// Immutable evidence that an event existed in a compatible source contract
/// when this directory entry was first written.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventDirectoryEntry {
    pub source_contract: Address,
    pub event_id: BytesN<32>,
    pub deposit_token: Address,
    pub indexed_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DirectoryError {
    SourceEventNotFound = 1,
    EntryNotFound = 2,
    EntryCountOverflow = 3,
}

#[contractevent(topics = ["directory", "event_indexed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventIndexed {
    #[topic]
    pub source_contract: Address,
    #[topic]
    pub event_id: BytesN<32>,
    pub deposit_token: Address,
    pub indexed_at: u64,
    pub total_entries: u32,
}

#[contract]
pub struct EventDirectory;

#[contractimpl]
impl EventDirectory {
    /// Verify an event through its source contract and persist one immutable
    /// directory entry.
    ///
    /// This is the Orange Belt inter-contract boundary: the directory invokes
    /// `has_event` and `get_deposit_token` on `source_contract` before writing
    /// anything. Re-indexing the same pair is idempotent and emits no duplicate
    /// event.
    pub fn index_event(
        env: Env,
        source_contract: Address,
        event_id: BytesN<32>,
    ) -> Result<EventDirectoryEntry, DirectoryError> {
        bump_instance_ttl(&env);
        let key = DataKey::Entry(source_contract.clone(), event_id.clone());
        if let Some(entry) = env.storage().persistent().get(&key) {
            bump_entry_ttl(&env, &key);
            return Ok(entry);
        }

        let source = RsvpSourceClient::new(&env, &source_contract);
        if !source.has_event(&event_id) {
            return Err(DirectoryError::SourceEventNotFound);
        }
        let deposit_token = source.get_deposit_token();
        let indexed_at = env.ledger().timestamp();
        let total_entries = current_total(&env)
            .checked_add(1)
            .ok_or(DirectoryError::EntryCountOverflow)?;
        let entry = EventDirectoryEntry {
            source_contract: source_contract.clone(),
            event_id: event_id.clone(),
            deposit_token: deposit_token.clone(),
            indexed_at,
        };

        env.storage().persistent().set(&key, &entry);
        bump_entry_ttl(&env, &key);
        env.storage()
            .instance()
            .set(&InstanceKey::TotalEntries, &total_entries);
        bump_instance_ttl(&env);

        EventIndexed {
            source_contract,
            event_id,
            deposit_token,
            indexed_at,
            total_entries,
        }
        .publish(&env);

        Ok(entry)
    }

    pub fn get_entry(
        env: Env,
        source_contract: Address,
        event_id: BytesN<32>,
    ) -> Result<EventDirectoryEntry, DirectoryError> {
        bump_instance_ttl(&env);
        let key = DataKey::Entry(source_contract, event_id);
        let entry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(DirectoryError::EntryNotFound)?;
        bump_entry_ttl(&env, &key);
        Ok(entry)
    }

    pub fn has_entry(env: Env, source_contract: Address, event_id: BytesN<32>) -> bool {
        bump_instance_ttl(&env);
        let key = DataKey::Entry(source_contract, event_id);
        let exists = env.storage().persistent().has(&key);
        if exists {
            bump_entry_ttl(&env, &key);
        }
        exists
    }

    pub fn total_entries(env: Env) -> u32 {
        bump_instance_ttl(&env);
        current_total(&env)
    }
}

fn current_total(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&InstanceKey::TotalEntries)
        .unwrap_or(0)
}

fn bump_instance_ttl(env: &Env) {
    let max_ttl = env.storage().max_ttl();
    if max_ttl > 0 {
        env.storage().instance().extend_ttl(max_ttl / 2, max_ttl);
    }
}

fn bump_entry_ttl(env: &Env, key: &DataKey) {
    let max_ttl = env.storage().max_ttl();
    if max_ttl > 0 {
        env.storage()
            .persistent()
            .extend_ttl(key, max_ttl / 2, max_ttl);
    }
}
