export type ExternalIdProvider = 'outlook' | 'google' | 'icloud';
export type ExternalIdResource = 'calendar' | 'todo';

export type CanonicalExternalId = `${ExternalIdProvider}:${ExternalIdResource}:${string}`;

function stripLegacyPrefixAndDashes(input: string, prefix: 'outlook-' | 'todo-'): string {
  let rest = input.slice(prefix.length);
  while (rest.startsWith('-')) rest = rest.slice(1);
  return rest;
}

export function buildExternalId(
  provider: ExternalIdProvider,
  resource: ExternalIdResource,
  remoteId: string
): CanonicalExternalId {
  const trimmedRemoteId = String(remoteId).trim();
  if (!trimmedRemoteId) {
    throw new Error('[SSOT] externalId remoteId must be non-empty');
  }
  return `${provider}:${resource}:${trimmedRemoteId}` as CanonicalExternalId;
}

export function parseExternalId(externalId: string): {
  provider: ExternalIdProvider;
  resource: ExternalIdResource;
  remoteId: string;
} | null {
  if (typeof externalId !== 'string') return null;
  const trimmed = externalId.trim();
  const parts = trimmed.split(':');
  if (parts.length < 3) return null;

  const provider = parts[0] as ExternalIdProvider;
  const resource = parts[1] as ExternalIdResource;
  const remoteId = parts.slice(2).join(':'); // be tolerant if remoteId contains ':'

  if (!remoteId) return null;

  const providerOk = provider === 'outlook' || provider === 'google' || provider === 'icloud';
  const resourceOk = resource === 'calendar' || resource === 'todo';

  if (!providerOk || !resourceOk) return null;

  return { provider, resource, remoteId };
}

export function canonicalizeExternalIdOrUndefined(
  input: unknown,
  options?: { defaultProvider?: ExternalIdProvider; defaultResource?: ExternalIdResource }
): CanonicalExternalId | undefined {
  if (typeof input !== 'string') return undefined;

  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const parsed = parseExternalId(trimmed);
  if (parsed) {
    return buildExternalId(parsed.provider, parsed.resource, parsed.remoteId);
  }

  // Legacy: outlook-<id> and todo-<id>
  if (trimmed.startsWith('outlook-')) {
    return buildExternalId('outlook', 'calendar', stripLegacyPrefixAndDashes(trimmed, 'outlook-'));
  }
  if (trimmed.startsWith('todo-')) {
    return buildExternalId('outlook', 'todo', stripLegacyPrefixAndDashes(trimmed, 'todo-'));
  }

  const provider = options?.defaultProvider ?? 'outlook';
  const resource = options?.defaultResource ?? 'calendar';
  return buildExternalId(provider, resource, trimmed);
}

export function getOutlookCalendarEventIdFromExternalId(externalId: string): string {
  const parsed = parseExternalId(externalId);
  if (parsed) {
    if (parsed.provider !== 'outlook' || parsed.resource !== 'calendar') {
      throw new Error(`[SSOT] Expected outlook:calendar externalId, got ${parsed.provider}:${parsed.resource}`);
    }
    return parsed.remoteId;
  }

  // Legacy raw or outlook- prefixed
  if (externalId.startsWith('outlook-')) return stripLegacyPrefixAndDashes(externalId, 'outlook-');
  return externalId;
}

export function isTodoExternalId(externalId: string): boolean {
  const parsed = parseExternalId(externalId);
  if (parsed) return parsed.resource === 'todo';
  return externalId.trim().startsWith('todo-');
}
