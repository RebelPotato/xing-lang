// lexer and parser

export function lex(tokens) {}

function parseExpr(tokens) {}

//// interpreter

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const Ok = (value) => ({
  value,
  then: (fn) => fn(value),
  map: (fn) => Ok(fn(value)),
  unwrap: () => value,
  unwrapElse: (fn) => value,
  isOk: true,
});
const Err = (message) => ({
  message,
  then: () => Err(message),
  map: () => Err(message),
  unwrap: () => {
    throw new Error(message);
  },
  unwrapElse: (fn) => fn(message),
  isOk: false,
});
function product(arr) {
  return arr.reduce((acc, x) => acc * x, 1);
}
function arrayEquals(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function map2(fn, arr0, arr1) {
  const result = Array(arr0.length);
  for (let i = 0; i < arr0.length; i++) result[i] = fn(arr0[i], arr1[i]);
  return result;
}
function liftOk(arr) {
  const result = Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!isOk(x)) return x;
    result[i] = x.value;
  }
  return Ok(result);
}
function cnNumSilly(num) {
  const str = num.toString();
  const from = `0123456789.-+e`;
  const to = `零一二三四五六七八九。負正易`;
  const arr = str.split("").map((c) => {
    const i = from.indexOf(c);
    if (i === -1) return c;
    return to[i];
  });
  return arr.join("");
}

/// types
const AtomTypeNames = ["int32", "char"];
const AtomTypes = Object.fromEntries(AtomTypeNames.map((name) => [name, name]));
const AtomInts = [AtomTypes.int32];
const AtomFloats = [];
const AtomNums = [...AtomInts, ...AtomFloats];
// does a js value fit in an atom type?
const fitInAtom = {
  int32: (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= -2147483648 &&
    value <= 2147483647,
  char: (value) => typeof value === "string" && value.length === 1, // an unicode character according to JavaScript
};
class AtomBase {
  constructor(type) {
    this.type = type;
  }
  equals(other) {
    return other instanceof AtomBase && this.type === other.type;
  }
  lift(shape) {
    return new ArrBase(this.type, shape);
  }
}
class ArrBase {
  constructor(type, shape) {
    this.type = type;
    this.shape = shape;
  }
  equals(other) {
    return (
      other instanceof ArrBase &&
      this.type.equals(other.type) &&
      arrayEquals(this.shape, other.shape)
    );
  }
  lift(shape) {
    return new ArrBase(this.type, [...shape, ...this.shape]);
  }
  length() {
    return product(this.shape);
  }
}
class BoxesBase {
  constructor(shape) {
    this.shape = shape;
  }
  equals(other) {
    return other instanceof BoxesBase && arrayEquals(this.shape, other.shape);
  }
  lift(shape) {
    return new BoxesBase([...shape, ...this.shape]);
  }
  length() {
    return product(this.shape);
  }
}

/// values
class Atom {
  constructor(type, value) {
    this.type = type;
    this.value = value;
  }
  base() {
    return new AtomBase(this.type);
  }
}
class Arr {
  constructor(type, shape, data) {
    this.type = type;
    this.shape = shape;
    this.data = data;
  }
  base() {
    return new ArrBase(this.type, this.shape);
  }
}
class Boxes {
  constructor(shape, data) {
    this.shape = shape;
    this.data = data;
  }
  base() {
    return new BoxesBase(this.shape);
  }
}
// collapse an array of atoms/arrays into a single typed array if possible
const nest = (shape) => (data) => {
  if (data.length === 0) return new Boxes([], data);
  let guessBase = null;
  for (const item of data) {
    const base = item.base();
    if (guessBase === null) guessBase = base;
    else if (!base.equals(guessBase)) return new Boxes(shape, data);
  }
  const newBase = guessBase.lift(shape);
  const len = newBase.length();
  const newData = Array(len);
  if (guessBase instanceof AtomBase) {
    for (let i = 0; i < len; i++) newData[i] = data[i].value;
  } else {
    let i = 0;
    for (const item of data)
      for (let j = 0; j < item.data.length; j++) {
        newData[i] = item.data[j];
        i++;
      }
  }
  return new Arr(newBase.type, newBase.shape, newData);
};
// convert a js value to an XNG value
export function toXNG(value) {
  if (Array.isArray(value)) return nest([value.length])(value.map(toXNG));
  if (typeof value === "string")
    return new Arr(AtomTypes.char, [value.length], value.split(""));
  for (const type of AtomTypeNames) {
    if (fitInAtom[type](value)) return new Atom(type, value);
  }
  throw new Error("unreachable");
}
function formatAtom(type, value) {
  if (type === AtomTypes.int32) return value.toString();
  if (type === AtomTypes.char) return value;
  throw new Error(`formatAtom: unsupported atom type ${type}`);
}
const leftpad = (str, len) => " ".repeat(len - str.length) + str;
function format(x) {
  if (x instanceof Atom) {
    const str = formatAtom(x.type, x.value);
    if (x.type === AtomTypes.char) str = `‘${str}’`;
    return [str];
  }
  assert(!(x instanceof Boxes), "format: Boxes not supported yet");
  if (x.shape.length === 0) return ["空"];
  const strs = x.data.map((v) => formatAtom(x.type, v));
  const collapse =
    x.type === AtomTypes.char ? (x) => x.join("") : (x) => x.join(" ");
  if (x.shape.length === 1) return [collapse(x.data)];

  // pad the strings in each column
  const columnCount = x.shape[x.shape.length - 1];
  const columnWidth = Array(columnCount).fill(0);
  for (let i = 0; i < strs.length; i++) {
    const ci = i % columnCount;
    columnWidth[ci] = Math.max(columnWidth[ci], strs[i].length);
  }
  const padded = strs.map((str, i) =>
    leftpad(str, columnWidth[i % columnCount])
  );

  // collect the rows
  const result = [];
  const newlineOn = [x.shape[x.shape.length - 1]];
  for (let i = x.shape.length - 2; i >= 0; i--)
    newlineOn.push(newlineOn[newlineOn.length - 1] * x.shape[i]);
  let row = [];
  for (let i = 0; i < padded.length; i++) {
    row.push(padded[i]);
    for (let j = newlineOn.length - 1; j >= 0; j--)
      if ((i + 1) % newlineOn[j] === 0) {
        result.push(collapse(row));
        row = [];
        if (j >= 1) result.push("\n".repeat(j - 1));
        break;
      }
  }
  result.pop();
  return result;
}

/// atomic functions
// unary
function mapA1(f) {
  function op(a) {
    if (a instanceof Atom)
      return f(a.type).map(
        ([fn, outputType]) => new Atom(outputType, fn(a.value))
      );
    if (a.type === AtomTypes.box)
      return liftOk(a.data.map(op)).map(nest(a.shape));
    return f(a.type).map(
      ([fn, outputType]) => new Arr(outputType, a.shape, a.data.map(fn))
    );
  }
  return op;
}
const negate1 = mapA1((type) => {
  if (AtomNums.includes(type)) return Ok([(x) => -x, type]);
  return Err(`negate not supported for type ${type}`);
});

// binary
function mapA2(f) {
  // op where a and b are both atoms
  const opAB = (aType, aValue, bType, bValue) =>
    f(aType, bType).map(
      ([fn, outputType]) => new Atom(outputType, fn(aValue, bValue))
    );
  // op where a is an atom and b is an atom or array
  function opA(aType, aValue, b) {
    if (b instanceof Atom) return opAB(aType, aValue, b.type, b.value);
    // map over b
    if (b instanceof Boxes)
      return liftOk(b.data.map((x) => opA(aType, aValue, x))).map(
        nest(b.shape)
      );
    return f(aType, b.type).map(
      ([fn, outputType]) =>
        new Arr(
          outputType,
          b.shape,
          b.data.map((x) => fn(aValue, x))
        )
    );
  }
  // op where a is an atom or array and b is an atom
  function opB(a, bType, bValue) {
    if (a instanceof Atom) return opAB(a.type, a.value, bType, bValue);
    // map over a
    if (a instanceof Boxes)
      return liftOk(a.data.map((x) => opB(x, bType, bValue))).map(
        nest(a.shape)
      );
    return f(a.type, bType).map(
      ([fn, outputType]) =>
        new Arr(
          outputType,
          a.shape,
          a.data.map((x) => fn(x, bValue))
        )
    );
  }
  function op(a, b) {
    if (a instanceof Atom) return opA(a.type, a.value, b);
    if (b instanceof Atom) return opB(a, b.type, b.value);
    // two arrays must have the same shape
    if (!arrayEquals(a.shape, b.shape))
      return Err(`arrays must have the same shape: ${a.shape} vs ${b.shape}`);
    if (a instanceof Boxes) {
      if (b instanceof Boxes)
        return liftOk(map2(op, a.data, b.data)).map(nest(a.shape));
      return liftOk(map2((x, y) => opA(a.type, x, y), a.data, b.data)).map(
        nest(a.shape)
      );
    }
    if (b instanceof Boxes)
      return liftOk(map2((x, y) => opB(x, b.type, y), a.data, b.data)).map(
        nest(b.shape)
      );
    // both are arrays with the same base type
    return f(a.type, b.type).map(
      ([fn, outputType]) =>
        new Arr(outputType, a.shape, map2(fn, a.data, b.data))
    );
  }
  return op;
}
const add2 = mapA2((aType, bType) => {
  for (const type of AtomNums) {
    if (aType === type && bType === type) return Ok([(x, y) => x + y, type]);
  }
  for (const type of AtomInts) {
    if (aType === AtomTypes.char && bType === type)
      return Ok([
        (x, y) => String.fromCharCode(x.charCodeAt(0) + y),
        AtomTypes.char,
      ]);
    if (bType === AtomTypes.char && aType === type)
      return Ok([
        (x, y) => String.fromCharCode(x + y.charCodeAt(0)),
        AtomTypes.char,
      ]);
  }
  return Err(`add not supported for types ${aType} and ${bType}`);
});
const sub2 = mapA2((aType, bType) => {
  for (const type of AtomNums) {
    if (aType === type && bType === type) return Ok([(x, y) => x - y, type]);
  }
  for (const type of AtomInts) {
    if (aType === AtomTypes.char && bType === type)
      return Ok([
        (x, y) => String.fromCharCode(x.charCodeAt(0) - y),
        AtomTypes.char,
      ]);
    if (bType === AtomTypes.char && aType === type)
      return Ok([
        (x, y) => String.fromCharCode(x - y.charCodeAt(0)),
        AtomTypes.char,
      ]);
  }
  return Err(`minus not supported for types ${aType} and ${bType}`);
});
const mul2 = mapA2((aType, bType) => {
  for (const type of AtomNums) {
    if (aType === type && bType === type) return Ok([(x, y) => x * y, type]);
  }
  return Err(`mult not supported for types ${aType} and ${bType}`);
});
const div2 = mapA2((aType, bType) => {
  for (const type of AtomInts) {
    if (aType === type && bType === type)
      return Ok([(x, y) => Math.trunc(x / y), type]);
  }
  for (const type of AtomFloats) {
    if (aType === type && bType === type) return Ok([(x, y) => x / y, type]);
  }
  return Err(`div not supported for types ${aType} and ${bType}`);
});

/// unary functions
function indices(shape, i) {
  const result = Array(shape.length);
  for (let j = shape.length - 1; j >= 0; j--) {
    result[j] = i % shape[j];
    i = Math.floor(i / shape[j]);
  }
  return result;
}
function range(a) {
  if (a instanceof Atom) {
    if (AtomInts.includes(a.type)) {
      if (a.value < 0) return Err(`range: cannot be negative`);
      const data = Array.from({ length: a.value }, (_, i) => i);
      return Ok(new Arr(AtomTypes.int32, [a.value], data));
    }
    return Err(`range: unsupported type ${a.type}`);
  }
  if (a instanceof Boxes) return liftOk(a.data.map(range)).map(nest(a.shape));
  if (AtomInts.includes(a.type)) {
    if (a.shape.length < 1)
      return Err(`range: shape must have at least one dimension`);
    const newShape = [...a.data, a.shape[0]];
    const len = product(a.data);
    const newData = Array(len * a.shape[0]);
    for (let i = 0; i < len; i++) {
      const ins = indices(a.data, i);
      for (let j = 0; j < a.shape[0]; j++) newData[i * a.shape[0] + j] = ins[j];
    }
    return Ok(new Arr(a.type, newShape, newData));
  }
  return Err(`range: unsupported type ${a.type}`);
}
function length(a) {
  if (a instanceof Atom) return Err(`length: cannot be called on an atom`);
  return Ok(new Atom(AtomTypes.int32, a.shape[0]));
}
function reshape(shape, a) {
  const theShape = shape instanceof Atom ? [shape.value] : shape.data;
  const len = product(theShape);
  if (a instanceof Atom)
    return Ok(new Arr(a.type, theShape, Array(len).fill(a.value)));
  const newData = Array(len);
  for (let i = 0; i < len; i++) newData[i] = a.data[i % a.data.length];
  return Ok(
    a instanceof Boxes
      ? new Boxes(theShape, newData)
      : new Arr(a.type, theShape, newData)
  );
}

/// adverbs
function table2(fn) {
  return (a, b) => {
    if (a instanceof Atom || b instanceof Atom) return fn(a, b);
  };
}

/// tree-walking interpreter
const ops = {
  negate: [negate1, null],
  add: [null, add2],
  sub: [null, sub2],
  mul: [null, mul2],
  div: [null, div2],
};
export function run(tree) {}

/// small tests
const flog = (x) => {
  if (x instanceof Atom) {
    console.log("Atom", x.type);
  } else if (x instanceof Arr) {
    console.log("Arr", x.type, x.shape);
  } else if (x instanceof Boxes) {
    console.log("Boxes", x.shape);
  }
  console.log(format(x).join("\n"));
};
let ans = toXNG("加（方（甲），加（方（乙），乘（2，加（甲，乙）））");
flog(ans);
