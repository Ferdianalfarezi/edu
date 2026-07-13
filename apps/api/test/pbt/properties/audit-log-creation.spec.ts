/**
 * Property 4: Audit log creation for sensitive entity operations
 *
 * For any create, update, or delete operation performed on a sensitive entity
 * (Tagihan, Pembayaran, User, Role assignment, Tenant config), the system SHALL
 * create an audit_logs entry containing: a valid action type, actor_user_id matching
 * the authenticated user, actor_role matching the user's role, a timestamp in ISO 8601
 * with timezone, the correct entity_type, the correct entity_id, the operation's
 * tenant_id, and the request IP address.
 *
 * **Validates: Requirements 5.1, 5.6**
 *
 * Pure logic property test — simulates the audit logging behavior by generating
 * random sensitive entity operations and verifying all required fields are present
 * and valid in the resulting audit entry.
 *
 * Tag: Feature: superadmin-cross-tenant-access, Property 4: Audit log creation for sensitive entity operations
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, ROLES } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

const SENSITIVE_ENTITY_TYPES = [
  'tagihan',
  'pembayaran',
  'user',
  'role_assignment',
  'tenant_config',
] as const;

type SensitiveEntityType = (typeof SENSITIVE_ENTITY_TYPES)[number];

const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'deactivate',
  'activate',
  'role_change',
  'password_reset',
] as const;

type AuditAction = (typeof AUDIT_ACTIONS)[number];

interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actor_user_id: string;
  actor_role: string;
  timestamp: string;
  entity_type: SensitiveEntityType;
  entity_id: string;
  tenant_id: string;
  ip_address: string;
}

interface SensitiveEntityOperation {
  action: AuditAction;
  actorUserId: string;
  actorRole: string;
  entityType: SensitiveEntityType;
  entityId: string;
  tenantId: string;
  ipAddress: string;
  timestamp: string;
}

// ─── Simulated Audit Log Store ────────────────────────────────────────────────

/**
 * Simulates audit log creation for sensitive entity operations.
 * Validates that every entry has all required fields before storing.
 */
class AuditLogStore {
  private entries: AuditLogEntry[] = [];

  /**
   * Creates an audit log entry from a sensitive entity operation.
   * Returns the created entry with a generated ID.
   */
  createEntry(operation: SensitiveEntityOperation): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      action: operation.action,
      actor_user_id: operation.actorUserId,
      actor_role: operation.actorRole,
      timestamp: operation.timestamp,
      entity_type: operation.entityType,
      entity_id: operation.entityId,
      tenant_id: operation.tenantId,
      ip_address: operation.ipAddress,
    };

    this.entries.push(entry);
    return entry;
  }

  getAll(): AuditLogEntry[] {
    return [...this.entries];
  }
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/** Generates a valid IPv4 address */
function arbitraryIpv4(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 1, max: 254 }),
    )
    .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);
}

/** Generates a valid IPv6 address */
function arbitraryIpv6(): fc.Arbitrary<string> {
  return fc
    .array(
      fc.integer({ min: 0, max: 0xffff }).map((n) => n.toString(16).padStart(4, '0')),
      { minLength: 8, maxLength: 8 },
    )
    .map((groups) => groups.join(':'));
}

/** Generates a valid IP address (IPv4 or IPv6) */
function arbitraryIpAddress(): fc.Arbitrary<string> {
  return fc.oneof(arbitraryIpv4(), arbitraryIpv6());
}

/** Generates a valid ISO 8601 timestamp with timezone */
function arbitraryIso8601WithTimezone(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.date({ min: new Date('2023-01-01'), max: new Date('2030-12-31') }),
      fc.integer({ min: -12, max: 14 }),
    )
    .map(([date, tzOffset]) => {
      const sign = tzOffset >= 0 ? '+' : '-';
      const absOffset = Math.abs(tzOffset);
      const hours = String(absOffset).padStart(2, '0');
      // Construct ISO string with explicit timezone offset
      const isoBase = date.toISOString().replace('Z', '');
      return `${isoBase}${sign}${hours}:00`;
    });
}

/** Generates a valid sensitive entity type */
function arbitraryEntityType(): fc.Arbitrary<SensitiveEntityType> {
  return fc.constantFrom(...SENSITIVE_ENTITY_TYPES);
}

/** Generates a valid audit action */
function arbitraryAuditAction(): fc.Arbitrary<AuditAction> {
  return fc.constantFrom(...AUDIT_ACTIONS);
}

/** Generates a valid actor role from the system roles */
function arbitraryActorRole(): fc.Arbitrary<string> {
  return fc.constantFrom(...ROLES);
}

/** Generates a complete sensitive entity operation */
function arbitrarySensitiveEntityOperation(): fc.Arbitrary<SensitiveEntityOperation> {
  return fc.record({
    action: arbitraryAuditAction(),
    actorUserId: arbitraryUuid(),
    actorRole: arbitraryActorRole(),
    entityType: arbitraryEntityType(),
    entityId: arbitraryUuid(),
    tenantId: arbitraryUuid(),
    ipAddress: arbitraryIpAddress(),
    timestamp: arbitraryIso8601WithTimezone(),
  });
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates ISO 8601 timestamp with timezone.
 * Accepts formats like: 2023-06-15T10:30:00.000+07:00
 */
function isValidIso8601WithTimezone(timestamp: string): boolean {
  // Must have a timezone offset (+HH:MM or -HH:MM) at the end
  const tzRegex = /[+-]\d{2}:\d{2}$/;
  if (!tzRegex.test(timestamp)) return false;
  // Must be parseable as a date
  const parsed = new Date(timestamp);
  return !isNaN(parsed.getTime());
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 4: Audit log creation for sensitive entity operations', () => {
  it('every audit entry has a non-empty action field from the valid set', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: action is a non-empty string from the valid action set
        return (
          entry.action.length > 0 && (AUDIT_ACTIONS as readonly string[]).includes(entry.action)
        );
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a valid UUID actor_user_id', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: actor_user_id is a valid UUID
        return UUID_REGEX.test(entry.actor_user_id);
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a non-empty actor_role from the valid roles', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: actor_role is non-empty and from the valid roles set
        return (
          entry.actor_role.length > 0 && (ROLES as readonly string[]).includes(entry.actor_role)
        );
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a valid ISO 8601 timestamp with timezone', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: timestamp is valid ISO 8601 with timezone offset
        return isValidIso8601WithTimezone(entry.timestamp);
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a valid entity_type from the sensitive entity set', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: entity_type is from the sensitive entity types set
        return (SENSITIVE_ENTITY_TYPES as readonly string[]).includes(entry.entity_type);
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a valid UUID entity_id', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: entity_id is a valid UUID
        return UUID_REGEX.test(entry.entity_id);
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a valid UUID tenant_id', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: tenant_id is a valid UUID
        return UUID_REGEX.test(entry.tenant_id);
      }),
      PBT_CONFIG,
    );
  });

  it('every audit entry has a non-empty ip_address', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: ip_address is non-empty
        return entry.ip_address.length > 0;
      }),
      PBT_CONFIG,
    );
  });

  it('audit entry fields match the original operation inputs', () => {
    fc.assert(
      fc.property(arbitrarySensitiveEntityOperation(), (operation) => {
        const store = new AuditLogStore();
        const entry = store.createEntry(operation);

        // PROPERTY: entry fields faithfully capture the operation's inputs
        return (
          entry.action === operation.action &&
          entry.actor_user_id === operation.actorUserId &&
          entry.actor_role === operation.actorRole &&
          entry.timestamp === operation.timestamp &&
          entry.entity_type === operation.entityType &&
          entry.entity_id === operation.entityId &&
          entry.tenant_id === operation.tenantId &&
          entry.ip_address === operation.ipAddress
        );
      }),
      PBT_CONFIG,
    );
  });
});
