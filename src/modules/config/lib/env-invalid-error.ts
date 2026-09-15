// Boot failure of the env schema (01 §3.3; 01 §4b `ALERT_ENV_INVALID`): the message carries NAMES only, never a value.
export class EnvInvalidError extends Error {
  readonly names: ReadonlyArray<string>;
  readonly environment: string;

  constructor(environment: string, names: ReadonlyArray<string>) {
    super(
      `ALERT_ENV_INVALID: ${names.length} environment name(s) missing or malformed (${environment}): ${names.join(", ")}`,
    );
    this.name = "EnvInvalidError";
    this.environment = environment;
    this.names = Object.freeze([...names]);
  }
}
