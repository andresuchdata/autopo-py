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

export function formatNumberID(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("id-ID", options).format(value);
}

export interface FormatPercentageOptions {
  /**
   * When provided, `value` is treated as the numerator, and this function will compute
   * the percentage relative to `total`. If omitted, `value` is assumed to already be a percentage.
   */
  total?: number;
  /**
   * Number of fraction digits when formatting non-integer percentages. Defaults to 1.
   */
  fractionDigits?: number;
}

export function formatPercentage(value: number, options: FormatPercentageOptions = {}) {
  const { total, fractionDigits = 1 } = options;
  let percent = value;

  if (typeof total === "number") {
    percent = total === 0 ? 0 : (value / total) * 100;
  }

  const rounded = Number(percent.toFixed(fractionDigits));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const minFractionDigits = Number.isInteger(normalized) ? 0 : fractionDigits;

  return formatNumberID(normalized, {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: fractionDigits,
  });
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
