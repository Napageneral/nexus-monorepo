export type AdapterCatalogSetupFieldOption = {
  label: string;
  value: string;
};

export type AdapterCatalogSetupField = {
  name: string;
  label: string;
  type: "secret" | "text" | "select";
  required: boolean;
  placeholder?: string;
  options?: AdapterCatalogSetupFieldOption[];
};

export type AdapterCatalogSetupMethod = {
  id: string;
  type: "oauth2" | "api_key" | "file_upload" | "custom_flow";
  label: string;
  icon: string;
  service?: string;
  scopes?: string[];
  platformCredentials?: boolean;
  platformCredentialUrl?: string;
  fields?: AdapterCatalogSetupField[];
  accept?: string[];
  templateUrl?: string;
  maxSize?: number;
};

export type AdapterCatalogSetupAuth = {
  methods: AdapterCatalogSetupMethod[];
  setupGuide?: string;
};

export type AdapterCatalogSetupDescriptor = {
  schemaVersion: "adapter-catalog-setup.v1";
  adapterId: string;
  displayName: string;
  description?: string;
  version?: string;
  platform?: string;
  name?: string;
  credentialService?: string;
  auth: AdapterCatalogSetupAuth;
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredString(value: unknown, label: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values : undefined;
}

function normalizeFieldOptions(value: unknown, label: string): AdapterCatalogSetupFieldOption[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const options = value.map((entry, index) => {
    const record = asRecord(entry, `${label}.options[${index}]`);
    return {
      label: requiredString(record.label, `${label}.options[${index}].label`),
      value: requiredString(record.value, `${label}.options[${index}].value`),
    };
  });
  return options.length > 0 ? options : undefined;
}

function normalizeFields(value: unknown, label: string): AdapterCatalogSetupField[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const fields = value.map((entry, index) => {
    const record = asRecord(entry, `${label}.fields[${index}]`);
    const fieldType = requiredString(record.type, `${label}.fields[${index}].type`);
    if (fieldType !== "secret" && fieldType !== "text" && fieldType !== "select") {
      throw new Error(`${label}.fields[${index}].type is not supported`);
    }
    const placeholder = optionalString(record.placeholder);
    const options = normalizeFieldOptions(record.options, `${label}.fields[${index}]`);
    const field: AdapterCatalogSetupField = {
      name: requiredString(record.name, `${label}.fields[${index}].name`),
      label: requiredString(record.label, `${label}.fields[${index}].label`),
      type: fieldType,
      required: Boolean(record.required),
    };
    if (placeholder) {
      field.placeholder = placeholder;
    }
    if (options) {
      field.options = options;
    }
    return field;
  });
  return fields.length > 0 ? fields : undefined;
}

function normalizeMethod(value: unknown, label: string): AdapterCatalogSetupMethod {
  const record = asRecord(value, label);
  const methodType = requiredString(record.type, `${label}.type`);
  if (
    methodType !== "oauth2" &&
    methodType !== "api_key" &&
    methodType !== "file_upload" &&
    methodType !== "custom_flow"
  ) {
    throw new Error(`${label}.type is not supported`);
  }

  const method: AdapterCatalogSetupMethod = {
    id: requiredString(record.id, `${label}.id`),
    type: methodType,
    label: requiredString(record.label, `${label}.label`),
    icon: requiredString(record.icon, `${label}.icon`),
  };
  const service = optionalString(record.service);
  const scopes = stringArray(record.scopes);
  const platformCredentials = optionalBoolean(record.platformCredentials);
  const platformCredentialUrl = optionalString(record.platformCredentialUrl);
  const fields = normalizeFields(record.fields, label);
  const accept = stringArray(record.accept);
  const templateUrl = optionalString(record.templateUrl);
  const maxSize = optionalPositiveInteger(record.maxSize);
  if (service) {
    method.service = service;
  }
  if (scopes) {
    method.scopes = scopes;
  }
  if (platformCredentials !== undefined) {
    method.platformCredentials = platformCredentials;
  }
  if (platformCredentialUrl) {
    method.platformCredentialUrl = platformCredentialUrl;
  }
  if (fields) {
    method.fields = fields;
  }
  if (accept) {
    method.accept = accept;
  }
  if (templateUrl) {
    method.templateUrl = templateUrl;
  }
  if (maxSize) {
    method.maxSize = maxSize;
  }
  return method;
}

function normalizeAuth(value: unknown, label: string): AdapterCatalogSetupAuth {
  const record = asRecord(value, label);
  if (!Array.isArray(record.methods) || record.methods.length === 0) {
    throw new Error(`${label}.methods must contain at least one setup method`);
  }
  const auth: AdapterCatalogSetupAuth = {
    methods: record.methods.map((method, index) => normalizeMethod(method, `${label}.methods[${index}]`)),
  };
  const setupGuide = optionalString(record.setupGuide);
  if (setupGuide) {
    auth.setupGuide = setupGuide;
  }
  return auth;
}

export function normalizeAdapterCatalogSetupDescriptor(
  value: unknown,
  label = "adapter.catalog.json",
): AdapterCatalogSetupDescriptor {
  const record = asRecord(value, label);
  const schemaVersion = requiredString(record.schemaVersion, `${label}.schemaVersion`);
  if (schemaVersion !== "adapter-catalog-setup.v1") {
    throw new Error(`${label}.schemaVersion is not supported`);
  }
  const descriptor: AdapterCatalogSetupDescriptor = {
    schemaVersion,
    adapterId: requiredString(record.adapterId, `${label}.adapterId`),
    displayName: requiredString(record.displayName, `${label}.displayName`),
    auth: normalizeAuth(record.auth, `${label}.auth`),
  };
  const description = optionalString(record.description);
  const version = optionalString(record.version);
  const platform = optionalString(record.platform);
  const name = optionalString(record.name);
  const credentialService = optionalString(record.credentialService);
  if (description) {
    descriptor.description = description;
  }
  if (version) {
    descriptor.version = version;
  }
  if (platform) {
    descriptor.platform = platform;
  }
  if (name) {
    descriptor.name = name;
  }
  if (credentialService) {
    descriptor.credentialService = credentialService;
  }
  return descriptor;
}
