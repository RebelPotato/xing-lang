// Info for parsing and interpreting
class Info {
  constructor(verbs, advs, conjs) {
    this.verbs = verbs;
    this.advs = advs;
    this.conjs = conjs;
  }
}

// lexer and parser

export function lex(str) {}

function parseExpr(tokens) {}

//// interpreter

function assert(condition, message) {
  console.error("Implementation error:", message);
  if (!condition) throw new Error(message);
}
const Ok = (value) => ({
  value,
  then: (fn) => fn(value),
  map: (fn) => Ok(fn(value)),
  mapErr: () => Ok(value),
  unwrap: () => value,
  unwrapElse: () => value,
  isOk: true,
});
const Err = (ctx) => ({
  ctx,
  then: () => Err(ctx),
  map: () => Err(ctx),
  mapErr: (fn) => Err(fn(ctx)),
  unwrap: () => {
    throw new Error(ctx);
  },
  unwrapElse: (fn) => fn(ctx),
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
const ATNames = ["bool", "int32", "float32", "char", "fn", "mod1", "mod2"];
const AT = {
  bool: "bool",
  int32: "int32",
  float32: "float32",
  char: "char",
  fn: "fn",
  mod1: "mod1",
  mod2: "mod2",
};
const AtomInts = [AT.int32];
const AtomFloats = [AT.float32];
const AtomNums = [...AtomInts, ...AtomFloats];
// does a js value fit in an atom type?
const fitInAtom = {
  bool: (value) => typeof value === "boolean",
  int32: (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= -2147483648 &&
    value <= 2147483647,
  float32: (value) => typeof value === "number" && !Number.isNaN(value),
  char: (value) => typeof value === "string" && value.length === 1, // an unicode character according to JavaScript
  fn: () => false,
  mod1: () => false,
  mod2: () => false,
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
  static bool(value) {
    assert(fitInAtom.bool(value));
    return new Atom(AT.bool, value);
  }
  static int32(value) {
    assert(fitInAtom.int32(value));
    return new Atom(AT.int32, value);
  }
  static float32(value) {
    assert(fitInAtom.float32(value));
    return new Atom(AT.float32, value);
  }
  static char(value) {
    assert(fitInAtom.char(value));
    return new Atom(AT.char, value);
  }
}
class Arr {
  constructor(type, shape, data, fill) {
    this.type = type;
    this.shape = shape;
    this.data = data;
    this.fill = fill;
  }
  base() {
    return new ArrBase(this.type, this.shape);
  }
}
class Boxes {
  constructor(shape, data, fill) {
    this.shape = shape;
    this.data = data;
    this.fill = fill;
  }
  base() {
    return new BoxesBase(this.shape);
  }
}
function dispatch(table, types) {
  const NotFound = Err(`dispatch.no_function_found`);
  const arity = types.length;
  const item = table[arity - 1];
  if (item === undefined) return NotFound;
  if (item.table !== undefined)
    for (const [forTypes, ret, fn] of item.table)
      if (arrayEquals(types, forTypes)) return Ok({ type: "static", ret, fn });
  return item.default !== undefined
    ? Ok({ type: "dynamic", fn: item.default })
    : NotFound;
}

// temporary helper: format a atom or array
function formatAtom(type, value) {
  if (type === AT.int32) return value.toString();
  if (type === AT.char) return value;
  throw new Error(`formatAtom: unsupported atom type ${type}`);
}
const leftpad = (str, len) => " ".repeat(len - str.length) + str;
function format(x) {
  if (x instanceof Atom) {
    const str = formatAtom(x.type, x.value);
    if (x.type === AT.char) str = `‘${str}’`;
    return [str];
  }
  assert(!(x instanceof Boxes), "format: Boxes not supported yet");
  if (x.shape.length === 0) return ["空"];
  const strs = x.data.map((v) => formatAtom(x.type, v));
  const collapse = x.type === AT.char ? (x) => x.join("") : (x) => x.join(" ");
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

/// primitive operators
// 类
function type1(x) {
  if (x instanceof Atom) {
    if (AtomNums.includes(x.type)) return Ok(Atom.char("数"));
    if (x.type === AT.char) return Ok(Atom.char("字"));
    if (x.type === AT.fn) return Ok(Atom.char("动"));
    if (x.type === AT.mod1) return Ok(Atom.char("单"));
    if (x.type === AT.mod2) return Ok(Atom.char("双"));
    assert(false);
  }
  if (x instanceof Arr || x instanceof Boxes) return Ok(Atom.char("阵"));
  assert(false);
}
const typeD = [{ default: type1 }];
// 充
function fill1(x) {
  if (x instanceof Arr) return Ok(new Atom(x.type, x.fill));
  if (x instanceof Boxes) return Ok(x.fill);
  return Err(`fill.get_atom_not_allowed`);
}
function fill2(w, x) {
  if (x instanceof Arr) {
    if (x.type !== w.type) return Err(`fill.set_type_mismatch`);
    return Ok(new Arr(x.type, x.shape, x.data, w));
  }
  if (x instanceof Boxes) return Ok(new Boxes(x.shape, x.data, w));
  return Err(`fill.set_atom_not_allowed`);
}
const fillD = [{ default: fill1 }, { default: fill2 }];
// 「对数」
const log1 = [
  ...AtomFloats.map((type) => [[type], type, (x) => Math.log(x)]),
  ...AtomInts.map((type) => [[type], AT.float32, (x) => Math.log(x)]),
];
const log2 = [
  ...AtomFloats.map((type) => [
    [type, type],
    type,
    (w, x) => Math.log(w) / Math.log(x),
  ]),
  ...AtomInts.map((type) => [
    [type, type],
    AT.float32,
    (w, x) => Math.log(w) / Math.log(x),
  ]),
];
const logD = [{ table: log1 }, { table: log2 }];
// 「组长」
function groupLen2(w, x) {
  if (!(w instanceof Atom && AtomInts.includes(w.type)))
    return Err(`group_length.w_is_not_int_atom`);
  if (!(x instanceof Arr && AtomInts.includes(x.type)))
    return Err(`group_length.x_is_not_int_array`);
  let len = -1;
  for (const a of x.data) len = Math.max(len, a);
  const newData = Array(Math.max(len + 1, w.value)).fill(0);
  for (const a of x.data) newData[a] += 1;
  return Ok(new Arr(AT.int32, [newData.length], newData, 0));
}
const groupLengthD = [undefined, { default: groupLen2 }];
// 断
function assert1(x) {
  if (x instanceof Atom && x.type === AT.bool && x.value === true) return Ok(x);
  return Err(x);
}
// 「组数」
function groupOrd2(w, x) {
  if (!(w instanceof Arr && AtomInts.includes(w.type)))
    return Err(`group_ord.w_is_not_int_array`);
  return Err(`group_ord.not_implemented`);
}
// 负
const negate1 = AtomNums.map((type) => [[type], type, (x) => -x]);
const negateD = [{ table: negate1 }];
// 加
const addCharNum = (w, x) => String.fromCharCode(w.charCodeAt(0) + x);
const add2 = [
  [[AT.bool, AT.bool], AT.bool, (w, x) => x || y],
  ...AtomNums.map((type) => [[type, type], type, (w, x) => w + x]),
  ...AtomInts.map((type) => [[AT.char, type], AT.char, addCharNum]),
  ...AtomInts.map((type) => [
    [type, AT.char],
    AT.char,
    (w, x) => addCharNum(x, w),
  ]),
];
const addD = [undefined, { table: add2 }];
// 减
const sub2 = [
  [[AT.bool, AT.bool], AT.bool, (w, x) => w && !x],
  ...AtomNums.map((type) => [[type, type], type, (w, x) => w - x]),
  ...AtomInts.map((type) => [
    [AT.char, type],
    AT.char,
    (w, x) => addCharNum(w, -x),
  ]),
  [[AT.char, AT.char], AT.int32, (w, x) => w.charCodeAt(0) - x.charCodeAt(0)],
];
const subD = [undefined, { table: sub2 }];
// 乘
const mul2 = [
  [[AT.bool, AT.bool], AT.bool, (w, x) => w && x],
  ...AtomNums.map((type) => [[type, type], type, (w, x) => w * x]),
];
const mulD = [undefined, { table: mul2 }];
// 「除以」
const div2 = [
  ...AtomInts.map((type) => [[type, type], type, (w, x) => Math.trunc(w / x)]),
  ...AtomFloats.map((type) => [[type, type], type, (w, x) => w / x]),
];
const divD = [undefined, { table: div2 }];
// 幂
const pow1 = [
  ...AtomFloats.map((type) => [[type], type, (x) => Math.exp(x)]),
  ...AtomInts.map((type) => [[type], AT.float32, (x) => Math.exp(x)]),
];
const pow2 = AtomNums.map((type) => [
  [type, type],
  type,
  (w, x) => Math.pow(w, x),
]);
const powD = [{ table: pow1 }, { table: pow2 }];
// 底
const base1 = [
  ...AtomNums.map((type) => [[type], type, (x) => Math.floor(x)]),
  ...AtomFloats.map((type) => [[type], AT.int32, (x) => Math.floor(x)]),
];
const baseD = [{ table: base1 }];
// 等
function rank1(x) {
  if (x instanceof Atom) return Ok(0);
  return Ok(x.shape.length);
}
const eq2 = [
  [[AT.bool, AT.bool], AT.bool, (w, x) => w === x],
  ...AtomNums.map((type) => [[type, type], AT.bool, (w, x) => w === x]),
  [[AT.char, AT.char], AT.bool, (w, x) => w === x],
];
const eqD = [{ default: rank1 }, { table: eq2 }];
// 「大于」
const gt2 = [
  [[AT.bool, AT.bool], AT.bool, (w, x) => w && !x],
  ...AtomNums.map((type) => [[type, type], AT.bool, (w, x) => w > x]),
  [[AT.char, AT.char], AT.bool, (w, x) => w.charCodeAt(0) > x.charCodeAt(0)],
];
const gtD = [undefined, { table: gt2 }];
// 形
function shape1(x) {
  if (x instanceof Atom) return Err(`shape.is_not_array`);
  return Ok(new Arr(AT.int32, [x.shape.length], x.shape, 0));
}

/// tree-walking interpreter
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
