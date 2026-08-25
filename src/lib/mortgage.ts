export type Inputs = {
  huisprijs: number;
  eigenGeld: number;
  rente: number; // % per jaar
  looptijdJaren: number;
  brutoInkomen: number; // per jaar, huishouden
  maandSparen: number; // huidige spaarcapaciteit per maand
  spaarrente: number; // % per jaar
  kostenKoperPct: number; // % van huisprijs
};

export const defaults: Inputs = {
  huisprijs: 425000,
  eigenGeld: 25000,
  rente: 4.1,
  looptijdJaren: 30,
  brutoInkomen: 78000,
  maandSparen: 750,
  spaarrente: 2.2,
  kostenKoperPct: 5,
};

/** Annuïtaire maandlast */
export function annuiteit(hoofdsom: number, jaarRente: number, jaren: number) {
  const i = jaarRente / 100 / 12;
  const n = jaren * 12;
  if (n <= 0) return 0;
  if (i === 0) return hoofdsom / n;
  return (hoofdsom * i) / (1 - Math.pow(1 + i, -n));
}

/**
 * Vereenvoudigde leencapaciteit naar NHG-achtige systematiek:
 * een woonquote op het bruto inkomen, oplopend met inkomen, gecorrigeerd voor rente.
 */
export function maxHypotheek(brutoInkomen: number, rente: number, jaren: number) {
  const quote =
    brutoInkomen < 40000 ? 0.215 : brutoInkomen < 70000 ? 0.245 : brutoInkomen < 110000 ? 0.27 : 0.295;
  const renteCorrectie = Math.max(0.8, Math.min(1.12, 1 + (3.5 - rente) * 0.045));
  const maandRuimte = (brutoInkomen * quote * renteCorrectie) / 12;
  const i = rente / 100 / 12;
  const n = jaren * 12;
  const factor = i === 0 ? n : (1 - Math.pow(1 + i, -n)) / i;
  return Math.max(0, maandRuimte * factor);
}

export type Scenario = ReturnType<typeof berekenScenario>;

export function berekenScenario(inp: Inputs) {
  const kostenKoper = (inp.huisprijs * inp.kostenKoperPct) / 100;
  const leenbaar = maxHypotheek(inp.brutoInkomen, inp.rente, inp.looptijdJaren);
  // Hypotheek nooit hoger dan de woningwaarde (100% LTV-grens)
  const hypotheek = Math.min(inp.huisprijs, leenbaar);
  const benodigdEigenGeld = Math.max(0, inp.huisprijs - hypotheek) + kostenKoper;
  const tekort = Math.max(0, benodigdEigenGeld - inp.eigenGeld);

  // Maanden sparen met samengestelde spaarrente
  const r = inp.spaarrente / 100 / 12;
  let saldo = inp.eigenGeld;
  const reeks: { maand: number; saldo: number; doel: number }[] = [
    { maand: 0, saldo: Math.round(saldo), doel: Math.round(benodigdEigenGeld) },
  ];
  let maanden = 0;
  const limiet = 480;
  while (saldo < benodigdEigenGeld && maanden < limiet && inp.maandSparen > 0) {
    saldo = saldo * (1 + r) + inp.maandSparen;
    maanden++;
    if (maanden % 3 === 0 || saldo >= benodigdEigenGeld) {
      reeks.push({ maand: maanden, saldo: Math.round(saldo), doel: Math.round(benodigdEigenGeld) });
    }
  }
  const haalbaar = tekort === 0 || (inp.maandSparen > 0 && maanden < limiet);

  const maandlast = annuiteit(hypotheek, inp.rente, inp.looptijdJaren);
  const totaleRente = maandlast * inp.looptijdJaren * 12 - hypotheek;
  const nettoMaandlast = maandlast * 0.88; // indicatieve hypotheekrenteaftrek
  const woonquote = (maandlast * 12) / Math.max(1, inp.brutoInkomen);

  return {
    kostenKoper,
    hypotheek,
    benodigdEigenGeld,
    tekort,
    maanden: tekort === 0 ? 0 : maanden,
    haalbaar,
    maandlast,
    nettoMaandlast,
    totaleRente,
    woonquote,
    reeks,
    maxHuisprijs: hypotheek + Math.max(0, inp.eigenGeld - kostenKoper),
  };
}

export const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

export function looptijdLabel(maanden: number) {
  if (maanden <= 0) return "nu al haalbaar";
  const j = Math.floor(maanden / 12);
  const m = maanden % 12;
  if (j === 0) return `${m} maand${m === 1 ? "" : "en"}`;
  if (m === 0) return `${j} jaar`;
  return `${j} jaar en ${m} mnd`;
}
