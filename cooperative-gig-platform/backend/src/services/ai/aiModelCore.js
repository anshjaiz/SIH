/**
 * aiModelCore.js
 *
 * Lightweight, dependency-free ML primitives used by every AI service.
 * Both models are TRAINED on actual MongoDB records — predictions come from
 * fitted weight vectors, never from hardcoded business rules.
 *
 *  - ridgeRegression : closed-form linear model (demand forecasting)
 *  - logisticRegression : gradient-descent classifier (matching / collab)
 */

// ---------- matrix helpers ----------

const matmul = (a, b) => {
  const ra = a.length, ca = a[0].length, cb = b[0].length;
  const out = Array.from({ length: ra }, () => new Array(cb).fill(0));
  for (let i = 0; i < ra; i++) {
    for (let k = 0; k < ca; k++) {
      const av = a[i][k];
      if (av === 0) continue;
      for (let j = 0; j < cb; j++) out[i][j] += av * b[k][j];
    }
  }
  return out;
};

const transpose = (a) => {
  const out = Array.from({ length: a[0].length }, () => new Array(a.length).fill(0));
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[0].length; j++) out[j][i] = a[i][j];
  return out;
};

const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

const addMat = (a, b) => a.map((row, i) => row.map((v, j) => v + b[i][j]));

const invert = (m) => {
  const n = m.length;
  const aug = m.map((row, i) => [...row, ...identity(n)[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    while (p < n && Math.abs(aug[p][i]) < 1e-12) p++;
    if (p === n) return null;
    [aug[i], aug[p]] = [aug[p], aug[i]];
    const d = aug[i][i];
    aug[i] = aug[i].map((v) => v / d);
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = aug[r][i];
      if (f === 0) continue;
      aug[r] = aug[r].map((v, j) => v - f * aug[i][j]);
    }
  }
  return aug.map((row) => row.slice(n));
};

// ---------- numeric helpers ----------

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a, m = mean(a)) => (a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) : 1);

/**
 * Fit standardization params (z-score) from a feature matrix (no bias col).
 */
const fitScaler = (X) => {
  const p = X[0].length;
  const means = new Array(p).fill(0);
  for (const row of X) for (let j = 0; j < p; j++) means[j] += row[j];
  for (let j = 0; j < p; j++) means[j] /= X.length;
  const sds = new Array(p).fill(0);
  for (const row of X) for (let j = 0; j < p; j++) sds[j] += (row[j] - means[j]) ** 2;
  for (let j = 0; j < p; j++) sds[j] = Math.sqrt(sds[j] / X.length) || 1;
  return { means, sds };
};

const transform = (X, scaler) =>
  X.map((row) => row.map((v, j) => (v - scaler.means[j]) / scaler.sds[j]));

// ---------- linear model (demand) ----------

/**
 * Fit y ~ X (with bias) via ridge regression using the normal equations.
 * Returns { weights, scaler } where prediction = bias + sum(w_j * z_j).
 */
const fitLinearRidge = (X, y, lambda = 0.1) => {
  const scaler = fitScaler(X);
  const Z = transform(X, scaler);
  const Xb = Z.map((row) => [1, ...row]);
  const yv = y.map((v) => [v]);
  const XtX = matmul(transpose(Xb), Xb);
  const reg = identity(XtX.length).map((row, i) => row.map((v) => v * lambda));
  reg[0][0] = 0; // don't penalise bias
  const coef = invert(addMat(XtX, reg));
  if (!coef) return null;
  const Xty = matmul(transpose(Xb), yv);
  const weights = matmul(coef, Xty).map((r) => r[0]);
  return {
    type: 'linear',
    weights,
    scaler,
    bias: weights[0],
    featureWeights: weights.slice(1),
  };
};

const predictLinear = (model, rawX) => {
  const z = transform([rawX], model.scaler)[0];
  let p = model.bias;
  for (let j = 0; j < z.length; j++) p += model.featureWeights[j] * z[j];
  return p;
};

// ---------- logistic model (matching / collaboration) ----------

/**
 * Fit binary logistic regression via gradient descent over standardized
 * features. Returns { weights, bias, scaler } + train metrics.
 */
const fitLogistic = (X, y, { iters = 400, lr = 0.5, lambda = 0.01 } = {}) => {
  const scaler = fitScaler(X);
  const Z = transform(X, scaler);
  const n = Z.length, p = Z[0].length;
  let w = new Array(p).fill(0);
  let b = 0;

  const sigmoid = (t) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, t))));

  for (let it = 0; it < iters; it++) {
    const gw = new Array(p).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const lin = b + Z[i].reduce((s, v, j) => s + w[j] * v, 0);
      const err = sigmoid(lin) - y[i];
      gb += err;
      for (let j = 0; j < p; j++) gw[j] += err * Z[i][j];
    }
    gb /= n;
    for (let j = 0; j < p; j++) gw[j] = gw[j] / n + (lambda * w[j]) / n;
    w = w.map((v, j) => v - lr * gw[j]);
    b -= lr * gb;
  }

  const probs = Z.map((row) => sigmoid(b + row.reduce((s, v, j) => s + w[j] * v, 0)));
  const preds = probs.map((pr) => (pr >= 0.5 ? 1 : 0));
  const correct = y.filter((v, i) => v === preds[i]).length;

  return {
    type: 'logistic',
    weights: w,
    bias: b,
    scaler,
    metrics: {
      accuracy: Math.round((correct / n) * 100),
      trainSamples: n,
    },
  };
};

const predictLogistic = (model, rawX) => {
  const z = transform([rawX], model.scaler)[0];
  const lin = model.bias + z.reduce((s, v, j) => s + model.weights[j] * v, 0);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, lin))));
};

// ---------- evaluation ----------

const evalRegression = (Y, P) => {
  const n = Y.length;
  if (!n) return { rmse: 0, mape: 0, r2: 0 };
  const ssRes = Y.reduce((s, v, i) => s + (v - P[i]) ** 2, 0);
  const m = mean(Y);
  const ssTot = Y.reduce((s, v) => s + (v - m) ** 2, 0);
  return {
    rmse: Math.round(Math.sqrt(ssRes / n) * 100) / 100,
    mape: Math.round((Y.reduce((s, v, i) => s + (Math.abs(v - P[i]) / (v || 1)), 0) / n) * 10000) / 100,
    r2: ssTot === 0 ? 1 : Math.round((1 - ssRes / ssTot) * 100) / 100,
  };
};

module.exports = {
  fitLinearRidge,
  predictLinear,
  fitLogistic,
  predictLogistic,
  fitScaler,
  transform,
  evalRegression,
  mean,
  std,
};