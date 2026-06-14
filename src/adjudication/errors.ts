/** Thrown when the live adjudicator HTTP call or response parsing fails. */
export class AdjudicationError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AdjudicationError";
  }
}
