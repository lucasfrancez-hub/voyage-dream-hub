export function normalizeFlightBaggage(flight: any): any {
  if (!flight || typeof flight !== "object") return flight;

  const asBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    if (typeof value !== "string") return undefined;
    const normalized = value.trim().toLowerCase();
    if (/^(true|sim|yes|included|inclus[ao]|1)$/.test(normalized)) return true;
    if (/^(false|nao|não|no|not included|0)$/.test(normalized)) return false;
    return undefined;
  };

  const baggageText = [
    flight.baggage_allowance,
    flight.baggage,
    flight.bags,
    flight.baggage_info,
    flight.baggage_details,
    flight.checked_baggage,
  ]
    .filter((value) => value != null)
    .map(String)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const fare = String(flight.fare_class ?? "").trim();
  const fareUpper = fare.toUpperCase();
  const hasCheckedEvidence =
    /(?:^|\b)(?:[1-9]\s*(?:pc|peca|bag)|23\s*kg|bagagem\s*despachada|mala\s*despachada|checked\s*bag|baggage\s*included)(?:\b|$)/i.test(baggageText) ||
    /^(STANDARD|FULL|TOP|MAX|PLUS|SEAT\s*\+\s*BAG)$/.test(fareUpper);
  const noCheckedEvidence =
    /(?:0\s*(?:pc|peca|bag)|sem\s+bagagem\s+despachada|nao\s+inclui\s+bagagem|no\s+checked\s+bag)/i.test(baggageText) ||
    /^(LIGHT|BASIC|ZERO|DISCOUNT)$/.test(fareUpper);
  const checkedValue = asBoolean(
    flight.checked_bag ?? flight.checked_baggage ?? flight.baggage_included,
  );
  const checked = hasCheckedEvidence ? true : noCheckedEvidence ? false : (checkedValue ?? false);

  return {
    ...flight,
    personal_item: asBoolean(flight.personal_item ?? flight.personalItem) ?? true,
    carry_on: asBoolean(flight.carry_on ?? flight.carryOn ?? flight.hand_baggage) ?? true,
    checked_bag: checked,
    fare_class:
      !fareUpper || fareUpper === "LIGHT" || fareUpper === "STANDARD"
        ? checked
          ? "STANDARD"
          : "LIGHT"
        : fare,
  };
}

export function normalizePackageFlights(pkg: any): any {
  if (!pkg || typeof pkg !== "object") return pkg;
  let outbound = normalizeFlightBaggage(pkg.outbound_flight);
  let inbound = normalizeFlightBaggage(pkg.return_flight);

  if (String(pkg.baggage_scope ?? "").toLowerCase() === "shared" && outbound && inbound) {
    const sharedChecked = !!(outbound.checked_bag || inbound.checked_bag);
    outbound = normalizeFlightBaggage({ ...outbound, checked_bag: sharedChecked });
    inbound = normalizeFlightBaggage({ ...inbound, checked_bag: sharedChecked });
  }

  const { baggage_scope: _baggageScope, ...rest } = pkg;
  return { ...rest, outbound_flight: outbound, return_flight: inbound };
}