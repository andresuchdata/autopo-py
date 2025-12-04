export interface FormatCurrencyOptions extends Intl.NumberFormatOptions {
  /**
   * If provided, values whose absolute value is greater than or equal to this threshold
   * will be formatted using compact notation (e.g. Rp1,2T)
   */
  compactThreshold?: number;
  /**
   * Maximum fraction digits to show when using compact notation.
   * Defaults to 1 when compact formatting is applied.
   */
  compactMaximumFractionDigits?: number;
}

export function formatCurrencyIDR(value: number, options: FormatCurrencyOptions = {}) {
  const { compactThreshold, compactMaximumFractionDigits = 1, ...numberOptions } = options;

  const baseOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: numberOptions.maximumFractionDigits ?? 0,
    ...numberOptions,
  };

  if (typeof compactThreshold === "number" && Math.abs(value) >= compactThreshold) {
    return new Intl.NumberFormat("id-ID", {
      ...baseOptions,
      notation: "compact",
      maximumFractionDigits: compactMaximumFractionDigits,
    }).format(value);
  }

  return new Intl.NumberFormat("id-ID", baseOptions).format(value);
}
