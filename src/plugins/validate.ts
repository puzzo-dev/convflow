import { PluginManifest, Verb } from './types';

const VERBS: Verb[] = ['GET', 'POST', 'PUT', 'DELETE'];
const INPUT_TYPES = ['text', 'doctype', 'fieldmap'];

// Validate an untrusted manifest before installing it. Returns the typed
// manifest or throws with a human-readable reason.
export function validateManifest(raw: any): PluginManifest {
  const err = (m: string) => { throw new Error(`Invalid manifest: ${m}`); };

  if (!raw || typeof raw !== 'object')                 err('must be a JSON object');
  if (typeof raw.id !== 'string' || !/^[a-z0-9_-]+$/.test(raw.id))
    err('id is required and must be lowercase letters, numbers, - or _');
  if (typeof raw.name !== 'string' || !raw.name.trim()) err('name is required');

  // credentials
  const c = raw.credentials;
  if (!c || typeof c !== 'object')                     err('credentials is required');
  if (c.source === 'stored') {
    if (!Array.isArray(c.fields)) err('credentials.fields must be an array for a "stored" source');
  } else if (c.source !== 'erpnext_connection') {
    err(`credentials.source must be "stored" or "erpnext_connection"`);
  }

  // actions
  if (!Array.isArray(raw.actions) || raw.actions.length === 0) err('actions must be a non-empty array');
  const ids = new Set<string>();
  for (const a of raw.actions) {
    if (typeof a.id !== 'string' || !a.id)   err('each action needs an id');
    if (ids.has(a.id))                       err(`duplicate action id "${a.id}"`);
    ids.add(a.id);
    if (typeof a.label !== 'string')         err(`action "${a.id}" needs a label`);
    if (!VERBS.includes(a.verb))             err(`action "${a.id}" verb must be one of ${VERBS.join(', ')}`);
    if (typeof a.url !== 'string' || !a.url) err(`action "${a.id}" needs a url template`);
    if (a.headers && typeof a.headers !== 'object') err(`action "${a.id}" headers must be an object`);
    if (a.bodyFrom && !['fields', 'none'].includes(a.bodyFrom)) err(`action "${a.id}" bodyFrom must be "fields" or "none"`);
    if (!Array.isArray(a.inputs))            err(`action "${a.id}" inputs must be an array`);
    for (const inp of a.inputs) {
      if (typeof inp.key !== 'string' || !inp.key)  err(`action "${a.id}" has an input without a key`);
      if (!INPUT_TYPES.includes(inp.type))          err(`input "${inp.key}" type must be one of ${INPUT_TYPES.join(', ')}`);
      if (inp.type === 'doctype' && !inp.optionsFrom) err(`input "${inp.key}" of type doctype needs optionsFrom`);
    }
  }

  // dynamicOptions (optional)
  if (raw.dynamicOptions) {
    if (typeof raw.dynamicOptions !== 'object') err('dynamicOptions must be an object');
    for (const [k, d] of Object.entries<any>(raw.dynamicOptions)) {
      if (!VERBS.includes(d.verb))    err(`dynamicOptions.${k}.verb invalid`);
      if (typeof d.url !== 'string')  err(`dynamicOptions.${k}.url required`);
      if (typeof d.itemsPath !== 'string') err(`dynamicOptions.${k}.itemsPath required`);
      if (typeof d.labelKey !== 'string' || typeof d.valueKey !== 'string')
        err(`dynamicOptions.${k} needs labelKey and valueKey`);
    }
  }

  return raw as PluginManifest;
}
