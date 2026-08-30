export interface InputValidationSuccess {
  ok: true;
  value: Record<string, unknown>;
}

export interface InputValidationFailure {
  ok: false;
  message: string;
}

export type InputValidationResult = InputValidationSuccess | InputValidationFailure;

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validate(schema: JsonSchema, value: unknown, path: string): string | null {
  const expectedType = schema.type;

  if (expectedType === "object") {
    if (!isRecord(value)) return `${path} must be an object.`;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const key of required) {
      if (typeof key === "string" && !Object.hasOwn(value, key)) {
        return `${path}.${key} is required.`;
      }
    }
    if (schema.additionalProperties === false) {
      const extra = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
      if (extra) return `${path}.${extra} is not allowed.`;
    }
    for (const [key, child] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      if (!isRecord(child)) return `${path}.${key} has an invalid schema.`;
      const error = validate(child, value[key], `${path}.${key}`);
      if (error) return error;
    }
    return null;
  }

  if (expectedType === "array") {
    if (!Array.isArray(value)) return `${path} must be an array.`;
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      return `${path} must contain at least ${schema.minItems} items.`;
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return `${path} must contain at most ${schema.maxItems} items.`;
    }
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      return `${path} must contain unique items.`;
    }
    if (isRecord(schema.items)) {
      for (let index = 0; index < value.length; index += 1) {
        const error = validate(schema.items, value[index], `${path}[${index}]`);
        if (error) return error;
      }
    }
    return null;
  }

  if (expectedType === "string") {
    if (typeof value !== "string") return `${path} must be a string.`;
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      return `${path} is too short.`;
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      return `${path} is too long.`;
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      return `${path} has an invalid format.`;
    }
    if (schema.format === "uuid" && !isValidUuid(value)) return `${path} must be a UUID.`;
    if (schema.format === "date" && !isValidDate(value)) return `${path} must be a valid date.`;
  } else if (expectedType === "integer") {
    if (!Number.isInteger(value)) return `${path} must be an integer.`;
  } else if (expectedType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return `${path} must be a number.`;
  } else if (expectedType === "boolean" && typeof value !== "boolean") {
    return `${path} must be a boolean.`;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path} must be one of: ${schema.enum.join(", ")}.`;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      return `${path} must be at least ${schema.minimum}.`;
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      return `${path} must be at most ${schema.maximum}.`;
    }
  }
  return null;
}

export function validateToolInput(schema: JsonSchema, input: unknown): InputValidationResult {
  const error = validate(schema, input, "input");
  if (error) return { ok: false, message: error };
  return { ok: true, value: input as Record<string, unknown> };
}
