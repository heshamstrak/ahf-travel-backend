import {
  add,
  applyRate,
  convert,
  divideHalfUp,
  formatMoney,
  money,
  MoneyError,
  multiplyByCount,
  parseMoney,
  parseRate,
  subtract,
  sum,
} from "./money";

describe("money (exact minor-unit arithmetic)", () => {
  it("parses decimals to minor units without floating point", () => {
    expect(parseMoney("5200", "EGP").minor).toBe(520_000n);
    expect(parseMoney("5200.5", "EGP").minor).toBe(520_050n);
    expect(parseMoney("0.10", "EGP").minor).toBe(10n);
    // Trailing zeros beyond the exponent are harmless. Real extra digits are not.
    expect(parseMoney("1.500", "EGP").minor).toBe(150n);
    expect(() => parseMoney("1.005", "EGP")).toThrow(MoneyError);
    expect(() => parseMoney("-1.00", "EGP")).toThrow(MoneyError);
    expect(() => parseMoney("1e3", "EGP")).toThrow(MoneyError);
  });

  it("does not drift the way JavaScript floats do", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point. Here it is exactly 0.30.
    const total = sum([parseMoney("0.10", "EGP"), parseMoney("0.20", "EGP")], "EGP");
    expect(formatMoney(total)).toBe("0.30");
  });

  it("formats with the currency's exponent, including zero-decimal currencies", () => {
    expect(formatMoney(money("EGP", 5n))).toBe("0.05");
    expect(formatMoney(money("EGP", 520_000n))).toBe("5200.00");
    expect(formatMoney(money("JPY", 1500n))).toBe("1500");
    expect(formatMoney(money("KWD", 1234n))).toBe("1.234");
  });

  it("refuses to combine currencies and refuses negative results", () => {
    expect(() => add(money("EGP", 100n), money("USD", 100n))).toThrow(/cannot combine/);
    expect(() => subtract(money("EGP", 100n), money("EGP", 200n))).toThrow(/negative/);
    expect(() => money("EGP", -1n)).toThrow(MoneyError);
    expect(() => money("XXX", 1n)).toThrow(/unsupported currency/);
  });

  it("rounds halves up, once per line, at the rounding boundaries", () => {
    expect(divideHalfUp(5n, 10n)).toBe(1n); // 0.5 rounds up to 1
    expect(divideHalfUp(4n, 10n)).toBe(0n); // 0.4 rounds down to 0
    expect(divideHalfUp(15n, 10n)).toBe(2n); // 1.5 rounds up to 2
    // 5 piastres at 10% is exactly 0.5 piastres: rounds up to 1.
    expect(applyRate(money("EGP", 5n), parseRate("0.1000", 4)).minor).toBe(1n);
    // 25 piastres at 14% is 3.5 piastres: rounds up to 4.
    expect(applyRate(money("EGP", 25n), parseRate("0.1400", 4)).minor).toBe(4n);
    // 35 piastres at 14% is 4.9 piastres: rounds to 5.
    expect(applyRate(money("EGP", 35n), parseRate("0.1400", 4)).minor).toBe(5n);
    expect(applyRate(money("EGP", 0n), parseRate("0.1400", 4)).minor).toBe(0n);
  });

  it("applies percentage rates exactly on large amounts", () => {
    // 14% of 9,876,543.21 EGP = 1,382,716.0494, which rounds to 1,382,716.05 EGP.
    const amount = parseMoney("9876543.21", "EGP");
    expect(formatMoney(applyRate(amount, parseRate("0.1400", 4)))).toBe("1382716.05");
  });

  it("converts currency with an exact rate and rounds to the target exponent", () => {
    // 100.00 EGP at 0.0205 USD per EGP is exactly 2.05 USD.
    expect(formatMoney(convert(parseMoney("100.00", "EGP"), "USD", parseRate("0.02050000", 8)))).toBe("2.05");
    // 1.00 EGP at 0.0205 is 0.0205 USD, which rounds to 0.02.
    expect(formatMoney(convert(parseMoney("1.00", "EGP"), "USD", parseRate("0.02050000", 8)))).toBe("0.02");
    // 50 piastres at 0.02 is exactly 1 cent.
    expect(convert(money("EGP", 50n), "USD", parseRate("0.02", 2)).minor).toBe(1n);
  });

  it("multiplies by a count exactly and rejects bad counts", () => {
    expect(formatMoney(multiplyByCount(parseMoney("650.00", "EGP"), 3))).toBe("1950.00");
    expect(() => multiplyByCount(parseMoney("1.00", "EGP"), -1)).toThrow(MoneyError);
    expect(() => multiplyByCount(parseMoney("1.00", "EGP"), 1.5)).toThrow(MoneyError);
  });
});
