// Pages whose addresses can carry one-time tokens or belong to signed-in people: Google must never see them.
export const PRIVATE = /^\/(admin|admin-login|sign|members|login|pending|account|notifications|ntfy|go|edit|mail|uploads|financials|blog\/(login|verify)|tours\/(cancel|respond|thread))(\/|$)/;
