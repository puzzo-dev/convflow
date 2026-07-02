const AUTH = { Authorization: 'token {creds.apiKey}:{creds.apiSecret}' };
// The ERPNext connector. Credentials come from each tenant's own ErpnextConnection,
// so the SAME manifest acts on whatever ERP instance a tenant has connected.
// Every action is parameterised by {input.doctype}, so the flow can target ANY doctype.
export const erpnextPlugin = {
    id: 'erpnext',
    name: 'ERPNext',
    description: 'Read and write any doctype in the tenant’s connected ERPNext.',
    credentials: { source: 'erpnext_connection' },
    // Live per-tenant option lists.
    dynamicOptions: {
        doctypes: {
            verb: 'GET',
            url: '{creds.baseUrl}/api/resource/DocType?limit_page_length=0',
            headers: AUTH,
            itemsPath: 'data',
            labelKey: 'name',
            valueKey: 'name',
        },
    },
    actions: [
        {
            id: 'create', label: 'Create', verb: 'POST',
            url: '{creds.baseUrl}/api/resource/{input.doctype}',
            headers: AUTH, bodyFrom: 'fields',
            inputs: [
                { key: 'doctype', label: 'Doctype', type: 'doctype', optionsFrom: 'doctypes', required: true },
                { key: 'fields', label: 'Field mapping', type: 'fieldmap', required: true,
                    help: 'Map ERPNext fields to flow answers, e.g. lead_name → {answers.name}' },
            ],
        },
        {
            id: 'read', label: 'Read', verb: 'GET',
            url: '{creds.baseUrl}/api/resource/{input.doctype}/{input.name}',
            headers: AUTH, bodyFrom: 'none',
            inputs: [
                { key: 'doctype', label: 'Doctype', type: 'doctype', optionsFrom: 'doctypes', required: true },
                { key: 'name', label: 'Document name / ID', type: 'text', required: true,
                    help: 'Supports tokens, e.g. {answers.order_id}' },
            ],
        },
        {
            id: 'update', label: 'Update', verb: 'PUT',
            url: '{creds.baseUrl}/api/resource/{input.doctype}/{input.name}',
            headers: AUTH, bodyFrom: 'fields',
            inputs: [
                { key: 'doctype', label: 'Doctype', type: 'doctype', optionsFrom: 'doctypes', required: true },
                { key: 'name', label: 'Document name / ID', type: 'text', required: true },
                { key: 'fields', label: 'Field mapping', type: 'fieldmap', required: true },
            ],
        },
        {
            id: 'delete', label: 'Delete', verb: 'DELETE',
            url: '{creds.baseUrl}/api/resource/{input.doctype}/{input.name}',
            headers: AUTH, bodyFrom: 'none',
            inputs: [
                { key: 'doctype', label: 'Doctype', type: 'doctype', optionsFrom: 'doctypes', required: true },
                { key: 'name', label: 'Document name / ID', type: 'text', required: true },
            ],
        },
    ],
};
