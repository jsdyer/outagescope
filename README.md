# Outage Scope

A static viewer of Georgia Tech IODA’s published Internet connectivity signals and outage detections. Find a country, subnational region or network by name, or enter a known code. Select a window of at most 30 UTC days. Try the July 2022 Rogers AS812 example to compare routing visibility, active probing and background traffic.

## Build and test

```sh
python3 scripts/build.py
node --test tests/*.test.mjs
python3 -m http.server --directory dist 8000
```

The tool fetches data directly from the [IODA API v2](https://api.ioda.inetintel.cc.gatech.edu/v2/docs), in two bounded requests for each history view, plus an optional entity-directory request. It uses native Canvas charts and HTML tables. The requested date range and entity can be copied as a shareable link, and official dashboard and endpoint links accompany each report. Shared links run live queries when opened. The project bundles no IODA datasets and serves no data mirror.

Detections are inferences from independent signals. One disruption can affect several signals, and there can be gaps and uneven coverage. Plots share a time range while scales vary by signal. Intervals shaded on plots describe detections linked to that signal. A missing or empty result does not establish network health. See [IODA at Georgia Tech](https://ioda.inetintel.cc.gatech.edu/) and its [signal explanations](https://ioda.inetintel.cc.gatech.edu/reports/watch-iodas-animation-videos-understanding-internet-connectivity-one-signal-at-a-time/).
