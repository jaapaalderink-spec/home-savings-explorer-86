# Household energy calculator, version 1

The homepage and quotation wizard use `src/lib/home-savings/scenario.ts`.
Existing devices belong to the baseline. A selected measure changes that
baseline; solar and battery quantities mean additions. An existing heat pump
is only replaced when explicitly requested. Results recompute on every edit.

## Model

Compare annual variable energy cost for two monthly energy balances. Allocate
solar production to concurrent demand, then battery charging, then export.
Charging is capped by surplus, remaining load and one usable cycle per day.
Include round-trip loss. Average each measure's marginal cost contribution
over all subsets (Shapley allocation), so contributions sum to package savings
and do not depend on click order. Negative outcomes remain visible.

Heat demand derives from measured gas excluding cooking and hot water, plus
existing electric heating. Use 8.8 kWh/m3 and 95% boiler efficiency. Existing
electric heating and home charging are included in total measured consumption
and subtracted before calculating changed loads. An all-electric target
replaces gas hot water separately; hybrid retains gas hot water and residual
space heating. Airco only replaces remaining gas space heat and adds cooling.
A charger compares home and public charging of the same EV.

## Assumptions and limits

Defaults are illustrative, editable assumptions, not measurements or tariffs
retrieved for the customer. Estimated PV yield is 850 kWh/kWp/year, to be
adjusted for roof direction, tilt and shade. Measured existing yield overrides
this estimate, including a measured zero. Existing and new arrays currently
share the estimated yield factor unless measured existing yield is provided.

SCOP defaults by flow temperature are model assumptions: 4.2/3.6/2.9/2.3 at
35/45/55/65 degrees; unknown uses 3.2. These are not certified device ratings.
Use installer/manufacturer seasonal performance where available. The model
does not size a heat pump, establish heat loss, or certify building suitability.
Electric heating metering is treated as one annual heat demand when its space
and water split is unknown. This reduces seasonal precision for existing heat pumps.

Monthly NL production and heating profiles and a single editable daytime
share approximate simultaneity. They cannot reproduce hourly weather, shading,
controls, battery power limits, standby consumption or dynamic trading.
The displayed package range varies new solar yield and new heating performance
by +/-20%; it is a sensitivity range, not a statistical confidence interval.
Per-measure ranges are illustrative +/-25%. Investment, maintenance, subsidies,
fixed gas charges and fixed export charges are excluded. Export price must be
net of per-kWh charges. No guaranteed arbitrage income or blanket combination
bonus is added. District heating requires individual assessment.

## Sources consulted 2026-09-15

- https://www.milieucentraal.nl/energie-besparen/duurzaam-verwarmen-en-koelen/welke-warmtepompen-zijn-er/
  Higher flow temperature reduces performance; hybrid and electric differ.
- https://www.milieucentraal.nl/energie-besparen/zonnepanelen/verbruik-zelf-meer-zonnestroom/
  Self-consumption depends on timing and the combination of appliances.
- https://www.milieucentraal.nl/energie-besparen/zonnepanelen/zonnestroom-als-de-saldering-stopt-dit-moet-je-weten/
  Distinguish 2026 saldering from the scenario without saldering from 2027.

## Data and verification

The validated profile travels in the quotation URL and is included with the
lead. Server submission recalculates savings. The complete profile is appended
to the existing notes field as readable JSON (no database migration).
Legacy columns remain available. Preview tests must not submit a real lead
or trigger SMS. Unit tests verify energy balances, existing equipment,
interaction attribution, heat performance, zeroes and negative outcomes.
