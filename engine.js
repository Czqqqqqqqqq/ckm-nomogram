(function (root) {
  "use strict";

  const data = root.CKMModelData || (typeof require === "function" && require("./model.js"));
  if (!data) throw new Error("Load model.js before engine.js.");

  const compiled = new Map();
  const f32 = Math.fround;
  const featureNames = Object.freeze(data.featureNames.slice());
  const factorial = [1, 1, 2, 6];

  // For one leaf, a known feature follows the person's branch (zero or one).
  // An unknown feature follows the branch according to the training Hessian cover.
  // Repeated splits on a feature belong to the same Shapley player.
  function prepareLeaf(weight, path) {
    const features = [];
    const fractions = [];
    const conditions = path.map(({ node, feature, left, fraction }) => {
      let slot = features.indexOf(feature);
      if (slot < 0) {
        slot = features.length;
        features.push(feature);
        fractions.push(1);
      }
      fractions[slot] *= fraction;
      return { node, left, bit: 1 << slot };
    });
    const n = features.length;
    if (n > 3) throw new Error("Expected trees of maximum depth three.");
    const states = 1 << n;
    const contributions = new Float64Array(states * n);
    // Shapley dummy-player invariance lets us enumerate only the features on this path.
    for (let matching = 0; matching < states; matching += 1) {
      for (let i = 0; i < n; i += 1) {
        const bit = 1 << i;
        const change = ((matching & bit) ? 1 : 0) - fractions[i];
        let total = 0;
        for (let known = 0; known < states; known += 1) {
          if (known & bit) continue;
          let knownCount = 0;
          let otherFactors = 1;
          for (let j = 0; j < n; j += 1) {
            if (i === j) continue;
            const otherBit = 1 << j;
            if (known & otherBit) {
              knownCount += 1;
              otherFactors *= (matching & otherBit) ? 1 : 0;
            } else {
              otherFactors *= fractions[j];
            }
          }
          const coalitionWeight = factorial[knownCount] * factorial[n - knownCount - 1] / factorial[n];
          total += coalitionWeight * otherFactors;
        }
        contributions[matching * n + i] = weight * change * total;
      }
    }
    return { conditions, features, contributions, allMatch: states - 1 };
  }

  function prepareTree(raw) {
    const nodes = raw.map(row => row.length === 2
      ? { weight: f32(row[0]), cover: f32(row[1]) }
      : { feature: row[0], cut: f32(row[1]), left: row[2], right: row[3],
          missingLeft: Boolean(row[4]), cover: f32(row[5]) });
    const leaves = [];
    function visit(index, path) {
      const node = nodes[index];
      if (node.feature === undefined) {
        leaves.push(prepareLeaf(node.weight, path));
        return node.weight;
      }
      const childMean = (child, left) => visit(child, path.concat({
        node: index, feature: node.feature, left, fraction: nodes[child].cover / node.cover
      }));
      const leftMean = childMean(node.left, true);
      const rightMean = childMean(node.right, false);
      return f32(f32(f32(leftMean * nodes[node.left].cover) +
                     f32(rightMean * nodes[node.right].cover)) / node.cover);
    }
    const bias = visit(0, []);
    return { nodes, leaves, bias };
  }

  function prepareModel(key) {
    if (key !== "Allcause" && key !== "CVD") throw new RangeError("Unknown outcome.");
    if (!compiled.has(key)) {
      const source = data[key];
      const initial = f32(Math.log(source.baseScore / (1 - source.baseScore)));
      const trees = source.trees.map(prepareTree);
      const bias = trees.reduce((sum, tree) => f32(sum + tree.bias), initial);
      compiled.set(key, { initial, trees, bias });
    }
    return compiled.get(key);
  }

  function predict(key, values) {
    if ((!Array.isArray(values) && !ArrayBuffer.isView(values)) || values.length !== featureNames.length) {
      throw new TypeError("Supply ten numerical features in the published order.");
    }
    const x = Float32Array.from(values, value => {
      if (value === null || Number.isNaN(value)) return NaN;
      if (typeof value !== "number" || !Number.isFinite(f32(value))) {
        throw new TypeError("Features must be finite numbers or null for missing values.");
      }
      return value;
    });
    const model = prepareModel(key);
    const contributions = new Float32Array(x.length);
    const treeContributions = new Float64Array(x.length);
    let margin = model.initial;
    for (const tree of model.trees) {
      treeContributions.fill(0);
      const branches = [];
      for (let i = 0; i < tree.nodes.length; i += 1) {
        const node = tree.nodes[i];
        if (node.feature !== undefined) {
          const value = x[node.feature];
          branches[i] = Number.isNaN(value) ? node.missingLeft : value < node.cut;
        }
      }
      let index = 0;
      while (tree.nodes[index].feature !== undefined) {
        const node = tree.nodes[index];
        index = branches[index] ? node.left : node.right;
      }
      margin = f32(margin + tree.nodes[index].weight);
      for (const leaf of tree.leaves) {
        let matching = leaf.allMatch;
        for (const condition of leaf.conditions) {
          if (branches[condition.node] !== condition.left) matching &= ~condition.bit;
        }
        const offset = matching * leaf.features.length;
        for (let i = 0; i < leaf.features.length; i += 1) {
          treeContributions[leaf.features[i]] += leaf.contributions[offset + i];
        }
      }
      for (let i = 0; i < x.length; i += 1) {
        contributions[i] = f32(contributions[i] + f32(treeContributions[i]));
      }
    }
    const probability = f32(1 / f32(1 + f32(Math.exp(-margin))));
    return { probability, margin, bias: model.bias, contributions: Array.from(contributions) };
  }

  const engine = Object.freeze({ featureNames, predict });
  root.CKMEngine = engine;
  if (typeof module === "object" && module.exports) module.exports = engine;
})(globalThis);
