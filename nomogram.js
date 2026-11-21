(function (root) {
  "use strict";

  const pointsPerLogOdds = 10;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function signed(value, digits = 2) {
    const magnitude = Math.abs(value);
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    if (magnitude > 0 && magnitude < 0.5 * 10 ** -digits) {
      return sign + "<" + (10 ** -digits).toFixed(digits);
    }
    return sign + magnitude.toFixed(digits);
  }

  function probabilityLabel(probability, digits) {
    return (probability * 100).toFixed(digits) + "%";
  }

  function upperLimit(points) {
    const maximum = Math.max(1, ...points.map(Math.abs));
    const magnitude = 10 ** Math.floor(Math.log10(maximum));
    const step = [1, 2, 2.5, 5, 10].find(unit => unit * magnitude >= maximum);
    return step * magnitude;
  }

  function axisLabel(value) {
    return signed(value, Number.isInteger(value) ? 0 : 1);
  }

  function scale(table, limit) {
    const row = table.createTHead().insertRow();
    const input = element("th", "ckm-ng-input", "Predictor and value");
    const markerHeader = element("th", "ckm-ng-plot-head");
    const scale = element("div", "ckm-ng-ticks");
    for (const value of [-limit, 0, limit]) scale.append(element("span", "", axisLabel(value)));
    markerHeader.setAttribute("aria-label", "Contribution scale from " + axisLabel(-limit) + " to " + axisLabel(limit) + " points");
    markerHeader.append(scale);
    const pointsHeader = element("th", "ckm-ng-score", "Points");
    for (const header of [input, markerHeader, pointsHeader]) header.scope = "col";
    row.append(input, markerHeader, pointsHeader);
  }

  function featureRow(body, feature, points, limit) {
    const row = body.insertRow();
    const label = element("th", "ckm-ng-input");
    label.scope = "row";
    const full = element("span", "ckm-ng-name", feature.label);
    label.append(full);
    if (feature.short && feature.short !== feature.label) {
      label.classList.add("ckm-ng-has-short");
      label.setAttribute("aria-label", feature.label + ", " + feature.valueLabel);
      const short = element("span", "ckm-ng-short", feature.short);
      short.setAttribute("aria-hidden", "true");
      label.append(short);
    }
    label.append(element("span", "ckm-ng-value", String(feature.valueLabel)));

    const area = element("td", "ckm-ng-plot");
    area.setAttribute("aria-hidden", "true");
    const track = element("div", "ckm-ng-track");
    const bar = element("span", "ckm-ng-bar");
    const position = 50 + points / limit * 50;
    const direction = points < 0 ? "negative" : points > 0 ? "positive" : "zero";
    bar.classList.add("ckm-ng-" + direction);
    bar.style.left = Math.min(50, position) + "%";
    bar.style.width = Math.abs(position - 50) + "%";
    track.append(bar);
    area.append(track);
    const score = element("td", "ckm-ng-score ckm-ng-" + direction, signed(points));
    score.title = signed(points, 6) + " points";
    row.append(label, area, score);
  }

  function summaryItem(label, points) {
    const item = element("div", "ckm-ng-total-item");
    const value = element("dd", "", signed(points));
    value.title = signed(points, 6) + " points";
    item.append(element("dt", "", label), value);
    return item;
  }

  function outcomeScale(total, base, probability) {
    const box = element("section", "ckm-ng-conversion");
    box.setAttribute("aria-label", "Total points to model probability");
    const heading = element("div", "ckm-ng-conversion-head");
    heading.append(element("span", "", "Model probability"), element("strong", "", probabilityLabel(probability, 2)));
    box.append(heading);

    // Equal distances are equal changes in log-odds. Each pair of tick labels
    // describes the same position, with probability = inverse logit(points / 10).
    const lower = Math.min(-40, total, base);
    const upper = Math.max(0, total, base);
    const step = Math.max(10, Math.ceil((upper - lower) / 4 / 5) * 5);
    const start = Math.floor(lower / step) * step;
    const stop = Math.ceil(upper / step) * step;
    const axis = element("div", "ckm-ng-conversion-axis");
    axis.setAttribute("aria-hidden", "true");
    const line = element("div", "ckm-ng-conversion-line");
    const position = (total - start) / (stop - start) * 100;
    const marker = element("span", "ckm-ng-total-marker");
    marker.style.left = position + "%";
    line.append(marker);
    axis.append(line);
    for (let tick = start; tick <= stop; tick += step) {
      const item = element("div", "ckm-ng-conversion-tick");
      item.style.left = (tick - start) / (stop - start) * 100 + "%";
      if (tick === start) item.classList.add("ckm-ng-first");
      if (tick === stop) item.classList.add("ckm-ng-last");
      const p = 1 / (1 + Math.exp(-tick / pointsPerLogOdds));
      item.append(element("span", "ckm-ng-tick-points", axisLabel(tick)),
        element("span", "ckm-ng-tick-probability", probabilityLabel(p, p < 0.01 ? 2 : 1)));
      axis.append(item);
    }
    box.append(axis, element("p", "ckm-ng-caption",
      "The marker shows this profile’s total. Ticks pair total points (above) with model probability (below)."));
    return box;
  }

  function render(container, result, features) {
    const { probability, margin, bias, contributions } = result;
    if (!Array.isArray(features) || features.length !== 10 || contributions.length !== features.length ||
        ![probability, margin, bias, ...contributions].every(Number.isFinite)) {
      throw new TypeError("A nomogram requires ten labeled predictors and their model contributions.");
    }
    const points = Array.from(contributions, value => value * pointsPerLogOdds);
    const base = bias * pointsPerLogOdds;
    const total = margin * pointsPerLogOdds;
    const figure = element("figure", "ckm-ng");
    figure.setAttribute("aria-label", "Individual prediction nomogram");
    figure.append(element("figcaption", "ckm-ng-intro",
      "Each predictor adds or subtracts points from the model baseline for this profile. Ten points equal one unit of log-odds."));

    const table = element("table", "ckm-ng-features");
    table.setAttribute("aria-label", "Individual TreeSHAP contributions in points");
    const limit = upperLimit(points);
    scale(table, limit);
    const body = table.createTBody();
    features.forEach((feature, index) => featureRow(body, feature, points[index], limit));
    figure.append(table);

    const totals = element("dl", "ckm-ng-totals");
    totals.append(summaryItem("Model baseline", base),
      summaryItem("Predictor sum", points.reduce((sum, value) => sum + value, 0)),
      summaryItem("Total points", total));
    figure.append(totals, outcomeScale(total, base, probability));
    container.replaceChildren(figure);
  }

  root.CKMNomogram = Object.freeze({ render });
})(globalThis);
