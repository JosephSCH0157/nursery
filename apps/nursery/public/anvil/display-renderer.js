var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
var tslib_es6_exports = {};
__export(tslib_es6_exports, {
  __addDisposableResource: () => __addDisposableResource,
  __assign: () => __assign,
  __asyncDelegator: () => __asyncDelegator,
  __asyncGenerator: () => __asyncGenerator,
  __asyncValues: () => __asyncValues,
  __await: () => __await,
  __awaiter: () => __awaiter,
  __classPrivateFieldGet: () => __classPrivateFieldGet,
  __classPrivateFieldIn: () => __classPrivateFieldIn,
  __classPrivateFieldSet: () => __classPrivateFieldSet,
  __createBinding: () => __createBinding,
  __decorate: () => __decorate,
  __disposeResources: () => __disposeResources,
  __esDecorate: () => __esDecorate,
  __exportStar: () => __exportStar,
  __extends: () => __extends,
  __generator: () => __generator,
  __importDefault: () => __importDefault,
  __importStar: () => __importStar,
  __makeTemplateObject: () => __makeTemplateObject,
  __metadata: () => __metadata,
  __param: () => __param,
  __propKey: () => __propKey,
  __read: () => __read,
  __rest: () => __rest,
  __rewriteRelativeImportExtension: () => __rewriteRelativeImportExtension,
  __runInitializers: () => __runInitializers,
  __setFunctionName: () => __setFunctionName,
  __spread: () => __spread,
  __spreadArray: () => __spreadArray,
  __spreadArrays: () => __spreadArrays,
  __values: () => __values,
  default: () => tslib_es6_default
});
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
    t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
        t[p[i]] = s[p[i]];
    }
  return t;
}
function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function __param(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) {
      if (kind === "field") initializers.unshift(_);
      else descriptor[key] = _;
    }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
}
function __runInitializers(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
}
function __propKey(x) {
  return typeof x === "symbol" ? x : "".concat(x);
}
function __setFunctionName(f, name, prefix) {
  if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
  return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
}
function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __exportStar(m, o) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
}
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
    ar = ar.concat(__read(arguments[i]));
  return ar;
}
function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++)
    for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
      r[k] = a[j];
  return r;
}
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function awaitReturn(f) {
    return function(v) {
      return Promise.resolve(v).then(f, reject);
    };
  }
  function verb(n, f) {
    if (g[n]) {
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
      if (f) i[n] = f(i[n]);
    }
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
}
function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function(e) {
    throw e;
  }), verb("return"), i[Symbol.iterator] = function() {
    return this;
  }, i;
  function verb(n, f) {
    i[n] = o[n] ? function(v) {
      return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
}
function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
  }
  __setModuleDefault(result, mod);
  return result;
}
function __importDefault(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet(receiver, state3, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state3 === "function" ? receiver !== state3 || !f : !state3.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state3.get(receiver);
}
function __classPrivateFieldSet(receiver, state3, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state3 === "function" ? receiver !== state3 || !f : !state3.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state3.set(receiver, value), value;
}
function __classPrivateFieldIn(state3, receiver) {
  if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function") throw new TypeError("Cannot use 'in' operator on non-object");
  return typeof state3 === "function" ? receiver === state3 : state3.has(receiver);
}
function __addDisposableResource(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    env.stack.push({ value, dispose, async });
  } else if (async) {
    env.stack.push({ async: true });
  }
  return value;
}
function __disposeResources(env) {
  function fail(e) {
    env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
    env.hasError = true;
  }
  var r, s = 0;
  function next() {
    while (r = env.stack.pop()) {
      try {
        if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
        if (r.dispose) {
          var result = r.dispose.call(r.value);
          if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
            fail(e);
            return next();
          });
        } else s |= 1;
      } catch (e) {
        fail(e);
      }
    }
    if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
    if (env.hasError) throw env.error;
  }
  return next();
}
function __rewriteRelativeImportExtension(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
}
var extendStatics, __assign, __createBinding, __setModuleDefault, ownKeys, _SuppressedError, tslib_es6_default;
var init_tslib_es6 = __esm({
  "../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs"() {
    extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    __assign = function() {
      __assign = Object.assign || function __assign2(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    __createBinding = Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    __setModuleDefault = Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    };
    ownKeys = function(o) {
      ownKeys = Object.getOwnPropertyNames || function(o2) {
        var ar = [];
        for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
        return ar;
      };
      return ownKeys(o);
    };
    _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
      var e = new Error(message);
      return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };
    tslib_es6_default = {
      __extends,
      __assign,
      __rest,
      __decorate,
      __param,
      __esDecorate,
      __runInitializers,
      __propKey,
      __setFunctionName,
      __metadata,
      __awaiter,
      __generator,
      __createBinding,
      __exportStar,
      __values,
      __read,
      __spread,
      __spreadArrays,
      __spreadArray,
      __await,
      __asyncGenerator,
      __asyncDelegator,
      __asyncValues,
      __makeTemplateObject,
      __importStar,
      __importDefault,
      __classPrivateFieldGet,
      __classPrivateFieldSet,
      __classPrivateFieldIn,
      __addDisposableResource,
      __disposeResources,
      __rewriteRelativeImportExtension
    };
  }
});

// ../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/helper.js
var require_helper = __commonJS({
  "../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/helper.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveFetch = void 0;
    var resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports.resolveFetch = resolveFetch;
  }
});

// ../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/types.js
var require_types = __commonJS({
  "../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FunctionRegion = exports.FunctionsHttpError = exports.FunctionsRelayError = exports.FunctionsFetchError = exports.FunctionsError = void 0;
    var FunctionsError2 = class extends Error {
      constructor(message, name = "FunctionsError", context) {
        super(message);
        this.name = name;
        this.context = context;
      }
    };
    exports.FunctionsError = FunctionsError2;
    var FunctionsFetchError2 = class extends FunctionsError2 {
      constructor(context) {
        super("Failed to send a request to the Edge Function", "FunctionsFetchError", context);
      }
    };
    exports.FunctionsFetchError = FunctionsFetchError2;
    var FunctionsRelayError2 = class extends FunctionsError2 {
      constructor(context) {
        super("Relay Error invoking the Edge Function", "FunctionsRelayError", context);
      }
    };
    exports.FunctionsRelayError = FunctionsRelayError2;
    var FunctionsHttpError2 = class extends FunctionsError2 {
      constructor(context) {
        super("Edge Function returned a non-2xx status code", "FunctionsHttpError", context);
      }
    };
    exports.FunctionsHttpError = FunctionsHttpError2;
    var FunctionRegion2;
    (function(FunctionRegion3) {
      FunctionRegion3["Any"] = "any";
      FunctionRegion3["ApNortheast1"] = "ap-northeast-1";
      FunctionRegion3["ApNortheast2"] = "ap-northeast-2";
      FunctionRegion3["ApSouth1"] = "ap-south-1";
      FunctionRegion3["ApSoutheast1"] = "ap-southeast-1";
      FunctionRegion3["ApSoutheast2"] = "ap-southeast-2";
      FunctionRegion3["CaCentral1"] = "ca-central-1";
      FunctionRegion3["EuCentral1"] = "eu-central-1";
      FunctionRegion3["EuWest1"] = "eu-west-1";
      FunctionRegion3["EuWest2"] = "eu-west-2";
      FunctionRegion3["EuWest3"] = "eu-west-3";
      FunctionRegion3["SaEast1"] = "sa-east-1";
      FunctionRegion3["UsEast1"] = "us-east-1";
      FunctionRegion3["UsWest1"] = "us-west-1";
      FunctionRegion3["UsWest2"] = "us-west-2";
    })(FunctionRegion2 || (exports.FunctionRegion = FunctionRegion2 = {}));
  }
});

// ../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/FunctionsClient.js
var require_FunctionsClient = __commonJS({
  "../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/FunctionsClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FunctionsClient = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var helper_1 = require_helper();
    var types_1 = require_types();
    var FunctionsClient = class {
      /**
       * Creates a new Functions client bound to an Edge Functions URL.
       *
       * @example
       * ```ts
       * import { FunctionsClient, FunctionRegion } from '@supabase/functions-js'
       *
       * const functions = new FunctionsClient('https://xyzcompany.supabase.co/functions/v1', {
       *   headers: { apikey: 'public-anon-key' },
       *   region: FunctionRegion.UsEast1,
       * })
       * ```
       */
      constructor(url, { headers = {}, customFetch, region = types_1.FunctionRegion.Any } = {}) {
        this.url = url;
        this.headers = headers;
        this.region = region;
        this.fetch = (0, helper_1.resolveFetch)(customFetch);
      }
      /**
       * Updates the authorization header
       * @param token - the new jwt token sent in the authorisation header
       * @example
       * ```ts
       * functions.setAuth(session.access_token)
       * ```
       */
      setAuth(token) {
        this.headers.Authorization = `Bearer ${token}`;
      }
      /**
       * Invokes a function
       * @param functionName - The name of the Function to invoke.
       * @param options - Options for invoking the Function.
       * @example
       * ```ts
       * const { data, error } = await functions.invoke('hello-world', {
       *   body: { name: 'Ada' },
       * })
       * ```
       */
      invoke(functionName_1) {
        return tslib_1.__awaiter(this, arguments, void 0, function* (functionName, options = {}) {
          var _a;
          let timeoutId;
          let timeoutController;
          try {
            const { headers, method, body: functionArgs, signal, timeout } = options;
            let _headers = {};
            let { region } = options;
            if (!region) {
              region = this.region;
            }
            const url = new URL(`${this.url}/${functionName}`);
            if (region && region !== "any") {
              _headers["x-region"] = region;
              url.searchParams.set("forceFunctionRegion", region);
            }
            let body;
            if (functionArgs && (headers && !Object.prototype.hasOwnProperty.call(headers, "Content-Type") || !headers)) {
              if (typeof Blob !== "undefined" && functionArgs instanceof Blob || functionArgs instanceof ArrayBuffer) {
                _headers["Content-Type"] = "application/octet-stream";
                body = functionArgs;
              } else if (typeof functionArgs === "string") {
                _headers["Content-Type"] = "text/plain";
                body = functionArgs;
              } else if (typeof FormData !== "undefined" && functionArgs instanceof FormData) {
                body = functionArgs;
              } else {
                _headers["Content-Type"] = "application/json";
                body = JSON.stringify(functionArgs);
              }
            } else {
              if (functionArgs && typeof functionArgs !== "string" && !(typeof Blob !== "undefined" && functionArgs instanceof Blob) && !(functionArgs instanceof ArrayBuffer) && !(typeof FormData !== "undefined" && functionArgs instanceof FormData)) {
                body = JSON.stringify(functionArgs);
              } else {
                body = functionArgs;
              }
            }
            let effectiveSignal = signal;
            if (timeout) {
              timeoutController = new AbortController();
              timeoutId = setTimeout(() => timeoutController.abort(), timeout);
              if (signal) {
                effectiveSignal = timeoutController.signal;
                signal.addEventListener("abort", () => timeoutController.abort());
              } else {
                effectiveSignal = timeoutController.signal;
              }
            }
            const response = yield this.fetch(url.toString(), {
              method: method || "POST",
              // headers priority is (high to low):
              // 1. invoke-level headers
              // 2. client-level headers
              // 3. default Content-Type header
              headers: Object.assign(Object.assign(Object.assign({}, _headers), this.headers), headers),
              body,
              signal: effectiveSignal
            }).catch((fetchError) => {
              throw new types_1.FunctionsFetchError(fetchError);
            });
            const isRelayError = response.headers.get("x-relay-error");
            if (isRelayError && isRelayError === "true") {
              throw new types_1.FunctionsRelayError(response);
            }
            if (!response.ok) {
              throw new types_1.FunctionsHttpError(response);
            }
            let responseType = ((_a = response.headers.get("Content-Type")) !== null && _a !== void 0 ? _a : "text/plain").split(";")[0].trim();
            let data;
            if (responseType === "application/json") {
              data = yield response.json();
            } else if (responseType === "application/octet-stream" || responseType === "application/pdf") {
              data = yield response.blob();
            } else if (responseType === "text/event-stream") {
              data = response;
            } else if (responseType === "multipart/form-data") {
              data = yield response.formData();
            } else {
              data = yield response.text();
            }
            return { data, error: null, response };
          } catch (error) {
            return {
              data: null,
              error,
              response: error instanceof types_1.FunctionsHttpError || error instanceof types_1.FunctionsRelayError ? error.context : void 0
            };
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        });
      }
    };
    exports.FunctionsClient = FunctionsClient;
  }
});

// ../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/index.js
var require_main = __commonJS({
  "../../node_modules/.pnpm/@supabase+functions-js@2.91.1/node_modules/@supabase/functions-js/dist/main/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FunctionRegion = exports.FunctionsRelayError = exports.FunctionsHttpError = exports.FunctionsFetchError = exports.FunctionsError = exports.FunctionsClient = void 0;
    var FunctionsClient_1 = require_FunctionsClient();
    Object.defineProperty(exports, "FunctionsClient", { enumerable: true, get: function() {
      return FunctionsClient_1.FunctionsClient;
    } });
    var types_1 = require_types();
    Object.defineProperty(exports, "FunctionsError", { enumerable: true, get: function() {
      return types_1.FunctionsError;
    } });
    Object.defineProperty(exports, "FunctionsFetchError", { enumerable: true, get: function() {
      return types_1.FunctionsFetchError;
    } });
    Object.defineProperty(exports, "FunctionsHttpError", { enumerable: true, get: function() {
      return types_1.FunctionsHttpError;
    } });
    Object.defineProperty(exports, "FunctionsRelayError", { enumerable: true, get: function() {
      return types_1.FunctionsRelayError;
    } });
    Object.defineProperty(exports, "FunctionRegion", { enumerable: true, get: function() {
      return types_1.FunctionRegion;
    } });
  }
});

// ../../node_modules/.pnpm/@supabase+postgrest-js@2.91.1/node_modules/@supabase/postgrest-js/dist/index.cjs
var require_dist = __commonJS({
  "../../node_modules/.pnpm/@supabase+postgrest-js@2.91.1/node_modules/@supabase/postgrest-js/dist/index.cjs"(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var PostgrestError2 = class extends Error {
      /**
      * @example
      * ```ts
      * import PostgrestError from '@supabase/postgrest-js'
      *
      * throw new PostgrestError({
      *   message: 'Row level security prevented the request',
      *   details: 'RLS denied the insert',
      *   hint: 'Check your policies',
      *   code: 'PGRST301',
      * })
      * ```
      */
      constructor(context) {
        super(context.message);
        this.name = "PostgrestError";
        this.details = context.details;
        this.hint = context.hint;
        this.code = context.code;
      }
    };
    var PostgrestBuilder = class {
      /**
      * Creates a builder configured for a specific PostgREST request.
      *
      * @example
      * ```ts
      * import PostgrestQueryBuilder from '@supabase/postgrest-js'
      *
      * const builder = new PostgrestQueryBuilder(
      *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
      *   { headers: new Headers({ apikey: 'public-anon-key' }) }
      * )
      * ```
      */
      constructor(builder) {
        var _builder$shouldThrowO, _builder$isMaybeSingl;
        this.shouldThrowOnError = false;
        this.method = builder.method;
        this.url = builder.url;
        this.headers = new Headers(builder.headers);
        this.schema = builder.schema;
        this.body = builder.body;
        this.shouldThrowOnError = (_builder$shouldThrowO = builder.shouldThrowOnError) !== null && _builder$shouldThrowO !== void 0 ? _builder$shouldThrowO : false;
        this.signal = builder.signal;
        this.isMaybeSingle = (_builder$isMaybeSingl = builder.isMaybeSingle) !== null && _builder$isMaybeSingl !== void 0 ? _builder$isMaybeSingl : false;
        if (builder.fetch) this.fetch = builder.fetch;
        else this.fetch = fetch;
      }
      /**
      * If there's an error with the query, throwOnError will reject the promise by
      * throwing the error instead of returning it as part of a successful response.
      *
      * {@link https://github.com/supabase/supabase-js/issues/92}
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Set an HTTP header for the request.
      */
      setHeader(name, value) {
        this.headers = new Headers(this.headers);
        this.headers.set(name, value);
        return this;
      }
      then(onfulfilled, onrejected) {
        var _this = this;
        if (this.schema === void 0) {
        } else if (["GET", "HEAD"].includes(this.method)) this.headers.set("Accept-Profile", this.schema);
        else this.headers.set("Content-Profile", this.schema);
        if (this.method !== "GET" && this.method !== "HEAD") this.headers.set("Content-Type", "application/json");
        const _fetch = this.fetch;
        let res = _fetch(this.url.toString(), {
          method: this.method,
          headers: this.headers,
          body: JSON.stringify(this.body),
          signal: this.signal
        }).then(async (res$1) => {
          let error = null;
          let data = null;
          let count = null;
          let status = res$1.status;
          let statusText = res$1.statusText;
          if (res$1.ok) {
            var _this$headers$get2, _res$headers$get;
            if (_this.method !== "HEAD") {
              var _this$headers$get;
              const body = await res$1.text();
              if (body === "") {
              } else if (_this.headers.get("Accept") === "text/csv") data = body;
              else if (_this.headers.get("Accept") && ((_this$headers$get = _this.headers.get("Accept")) === null || _this$headers$get === void 0 ? void 0 : _this$headers$get.includes("application/vnd.pgrst.plan+text"))) data = body;
              else data = JSON.parse(body);
            }
            const countHeader = (_this$headers$get2 = _this.headers.get("Prefer")) === null || _this$headers$get2 === void 0 ? void 0 : _this$headers$get2.match(/count=(exact|planned|estimated)/);
            const contentRange = (_res$headers$get = res$1.headers.get("content-range")) === null || _res$headers$get === void 0 ? void 0 : _res$headers$get.split("/");
            if (countHeader && contentRange && contentRange.length > 1) count = parseInt(contentRange[1]);
            if (_this.isMaybeSingle && _this.method === "GET" && Array.isArray(data)) if (data.length > 1) {
              error = {
                code: "PGRST116",
                details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 row`,
                hint: null,
                message: "JSON object requested, multiple (or no) rows returned"
              };
              data = null;
              count = null;
              status = 406;
              statusText = "Not Acceptable";
            } else if (data.length === 1) data = data[0];
            else data = null;
          } else {
            var _error$details;
            const body = await res$1.text();
            try {
              error = JSON.parse(body);
              if (Array.isArray(error) && res$1.status === 404) {
                data = [];
                error = null;
                status = 200;
                statusText = "OK";
              }
            } catch (_unused) {
              if (res$1.status === 404 && body === "") {
                status = 204;
                statusText = "No Content";
              } else error = { message: body };
            }
            if (error && _this.isMaybeSingle && (error === null || error === void 0 || (_error$details = error.details) === null || _error$details === void 0 ? void 0 : _error$details.includes("0 rows"))) {
              error = null;
              status = 200;
              statusText = "OK";
            }
            if (error && _this.shouldThrowOnError) throw new PostgrestError2(error);
          }
          return {
            error,
            data,
            count,
            status,
            statusText
          };
        });
        if (!this.shouldThrowOnError) res = res.catch((fetchError) => {
          var _fetchError$name2;
          let errorDetails = "";
          const cause = fetchError === null || fetchError === void 0 ? void 0 : fetchError.cause;
          if (cause) {
            var _cause$message, _cause$code, _fetchError$name, _cause$name;
            const causeMessage = (_cause$message = cause === null || cause === void 0 ? void 0 : cause.message) !== null && _cause$message !== void 0 ? _cause$message : "";
            const causeCode = (_cause$code = cause === null || cause === void 0 ? void 0 : cause.code) !== null && _cause$code !== void 0 ? _cause$code : "";
            errorDetails = `${(_fetchError$name = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name !== void 0 ? _fetchError$name : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`;
            errorDetails += `

Caused by: ${(_cause$name = cause === null || cause === void 0 ? void 0 : cause.name) !== null && _cause$name !== void 0 ? _cause$name : "Error"}: ${causeMessage}`;
            if (causeCode) errorDetails += ` (${causeCode})`;
            if (cause === null || cause === void 0 ? void 0 : cause.stack) errorDetails += `
${cause.stack}`;
          } else {
            var _fetchError$stack;
            errorDetails = (_fetchError$stack = fetchError === null || fetchError === void 0 ? void 0 : fetchError.stack) !== null && _fetchError$stack !== void 0 ? _fetchError$stack : "";
          }
          return {
            error: {
              message: `${(_fetchError$name2 = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name2 !== void 0 ? _fetchError$name2 : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`,
              details: errorDetails,
              hint: "",
              code: ""
            },
            data: null,
            count: null,
            status: 0,
            statusText: ""
          };
        });
        return res.then(onfulfilled, onrejected);
      }
      /**
      * Override the type of the returned `data`.
      *
      * @typeParam NewResult - The new result type to override with
      * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
      */
      returns() {
        return this;
      }
      /**
      * Override the type of the returned `data` field in the response.
      *
      * @typeParam NewResult - The new type to cast the response data to
      * @typeParam Options - Optional type configuration (defaults to { merge: true })
      * @typeParam Options.merge - When true, merges the new type with existing return type. When false, replaces the existing types entirely (defaults to true)
      * @example
      * ```typescript
      * // Merge with existing types (default behavior)
      * const query = supabase
      *   .from('users')
      *   .select()
      *   .overrideTypes<{ custom_field: string }>()
      *
      * // Replace existing types completely
      * const replaceQuery = supabase
      *   .from('users')
      *   .select()
      *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
      * ```
      * @returns A PostgrestBuilder instance with the new type
      */
      overrideTypes() {
        return this;
      }
    };
    var PostgrestTransformBuilder = class extends PostgrestBuilder {
      /**
      * Perform a SELECT on the query result.
      *
      * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
      * return modified rows. By calling this method, modified rows are returned in
      * `data`.
      *
      * @param columns - The columns to retrieve, separated by commas
      */
      select(columns) {
        let quoted = false;
        const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
          if (/\s/.test(c) && !quoted) return "";
          if (c === '"') quoted = !quoted;
          return c;
        }).join("");
        this.url.searchParams.set("select", cleanedColumns);
        this.headers.append("Prefer", "return=representation");
        return this;
      }
      /**
      * Order the query result by `column`.
      *
      * You can call this method multiple times to order by multiple columns.
      *
      * You can order referenced tables, but it only affects the ordering of the
      * parent table if you use `!inner` in the query.
      *
      * @param column - The column to order by
      * @param options - Named parameters
      * @param options.ascending - If `true`, the result will be in ascending order
      * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
      * `null`s appear last.
      * @param options.referencedTable - Set this to order a referenced table by
      * its columns
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      order(column, { ascending = true, nullsFirst, foreignTable, referencedTable = foreignTable } = {}) {
        const key = referencedTable ? `${referencedTable}.order` : "order";
        const existingOrder = this.url.searchParams.get(key);
        this.url.searchParams.set(key, `${existingOrder ? `${existingOrder},` : ""}${column}.${ascending ? "asc" : "desc"}${nullsFirst === void 0 ? "" : nullsFirst ? ".nullsfirst" : ".nullslast"}`);
        return this;
      }
      /**
      * Limit the query result by `count`.
      *
      * @param count - The maximum number of rows to return
      * @param options - Named parameters
      * @param options.referencedTable - Set this to limit rows of referenced
      * tables instead of the parent table
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      limit(count, { foreignTable, referencedTable = foreignTable } = {}) {
        const key = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
        this.url.searchParams.set(key, `${count}`);
        return this;
      }
      /**
      * Limit the query result by starting at an offset `from` and ending at the offset `to`.
      * Only records within this range are returned.
      * This respects the query order and if there is no order clause the range could behave unexpectedly.
      * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
      * and fourth rows of the query.
      *
      * @param from - The starting index from which to limit the result
      * @param to - The last index to which to limit the result
      * @param options - Named parameters
      * @param options.referencedTable - Set this to limit rows of referenced
      * tables instead of the parent table
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      range(from, to, { foreignTable, referencedTable = foreignTable } = {}) {
        const keyOffset = typeof referencedTable === "undefined" ? "offset" : `${referencedTable}.offset`;
        const keyLimit = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
        this.url.searchParams.set(keyOffset, `${from}`);
        this.url.searchParams.set(keyLimit, `${to - from + 1}`);
        return this;
      }
      /**
      * Set the AbortSignal for the fetch request.
      *
      * @param signal - The AbortSignal to use for the fetch request
      */
      abortSignal(signal) {
        this.signal = signal;
        return this;
      }
      /**
      * Return `data` as a single object instead of an array of objects.
      *
      * Query result must be one row (e.g. using `.limit(1)`), otherwise this
      * returns an error.
      */
      single() {
        this.headers.set("Accept", "application/vnd.pgrst.object+json");
        return this;
      }
      /**
      * Return `data` as a single object instead of an array of objects.
      *
      * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
      * this returns an error.
      */
      maybeSingle() {
        if (this.method === "GET") this.headers.set("Accept", "application/json");
        else this.headers.set("Accept", "application/vnd.pgrst.object+json");
        this.isMaybeSingle = true;
        return this;
      }
      /**
      * Return `data` as a string in CSV format.
      */
      csv() {
        this.headers.set("Accept", "text/csv");
        return this;
      }
      /**
      * Return `data` as an object in [GeoJSON](https://geojson.org) format.
      */
      geojson() {
        this.headers.set("Accept", "application/geo+json");
        return this;
      }
      /**
      * Return `data` as the EXPLAIN plan for the query.
      *
      * You need to enable the
      * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
      * setting before using this method.
      *
      * @param options - Named parameters
      *
      * @param options.analyze - If `true`, the query will be executed and the
      * actual run time will be returned
      *
      * @param options.verbose - If `true`, the query identifier will be returned
      * and `data` will include the output columns of the query
      *
      * @param options.settings - If `true`, include information on configuration
      * parameters that affect query planning
      *
      * @param options.buffers - If `true`, include information on buffer usage
      *
      * @param options.wal - If `true`, include information on WAL record generation
      *
      * @param options.format - The format of the output, can be `"text"` (default)
      * or `"json"`
      */
      explain({ analyze = false, verbose = false, settings = false, buffers = false, wal = false, format = "text" } = {}) {
        var _this$headers$get;
        const options = [
          analyze ? "analyze" : null,
          verbose ? "verbose" : null,
          settings ? "settings" : null,
          buffers ? "buffers" : null,
          wal ? "wal" : null
        ].filter(Boolean).join("|");
        const forMediatype = (_this$headers$get = this.headers.get("Accept")) !== null && _this$headers$get !== void 0 ? _this$headers$get : "application/json";
        this.headers.set("Accept", `application/vnd.pgrst.plan+${format}; for="${forMediatype}"; options=${options};`);
        if (format === "json") return this;
        else return this;
      }
      /**
      * Rollback the query.
      *
      * `data` will still be returned, but the query is not committed.
      */
      rollback() {
        this.headers.append("Prefer", "tx=rollback");
        return this;
      }
      /**
      * Override the type of the returned `data`.
      *
      * @typeParam NewResult - The new result type to override with
      * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
      */
      returns() {
        return this;
      }
      /**
      * Set the maximum number of rows that can be affected by the query.
      * Only available in PostgREST v13+ and only works with PATCH and DELETE methods.
      *
      * @param value - The maximum number of rows that can be affected
      */
      maxAffected(value) {
        this.headers.append("Prefer", "handling=strict");
        this.headers.append("Prefer", `max-affected=${value}`);
        return this;
      }
    };
    var PostgrestReservedCharsRegexp = /* @__PURE__ */ new RegExp("[,()]");
    var PostgrestFilterBuilder = class extends PostgrestTransformBuilder {
      /**
      * Match only rows where `column` is equal to `value`.
      *
      * To check if the value of `column` is NULL, you should use `.is()` instead.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      eq(column, value) {
        this.url.searchParams.append(column, `eq.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is not equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      neq(column, value) {
        this.url.searchParams.append(column, `neq.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is greater than `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      gt(column, value) {
        this.url.searchParams.append(column, `gt.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is greater than or equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      gte(column, value) {
        this.url.searchParams.append(column, `gte.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is less than `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      lt(column, value) {
        this.url.searchParams.append(column, `lt.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is less than or equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      lte(column, value) {
        this.url.searchParams.append(column, `lte.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` matches `pattern` case-sensitively.
      *
      * @param column - The column to filter on
      * @param pattern - The pattern to match with
      */
      like(column, pattern) {
        this.url.searchParams.append(column, `like.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches all of `patterns` case-sensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      likeAllOf(column, patterns) {
        this.url.searchParams.append(column, `like(all).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches any of `patterns` case-sensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      likeAnyOf(column, patterns) {
        this.url.searchParams.append(column, `like(any).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches `pattern` case-insensitively.
      *
      * @param column - The column to filter on
      * @param pattern - The pattern to match with
      */
      ilike(column, pattern) {
        this.url.searchParams.append(column, `ilike.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches all of `patterns` case-insensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      ilikeAllOf(column, patterns) {
        this.url.searchParams.append(column, `ilike(all).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches any of `patterns` case-insensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      ilikeAnyOf(column, patterns) {
        this.url.searchParams.append(column, `ilike(any).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches the PostgreSQL regex `pattern`
      * case-sensitively (using the `~` operator).
      *
      * @param column - The column to filter on
      * @param pattern - The PostgreSQL regular expression pattern to match with
      */
      regexMatch(column, pattern) {
        this.url.searchParams.append(column, `match.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches the PostgreSQL regex `pattern`
      * case-insensitively (using the `~*` operator).
      *
      * @param column - The column to filter on
      * @param pattern - The PostgreSQL regular expression pattern to match with
      */
      regexIMatch(column, pattern) {
        this.url.searchParams.append(column, `imatch.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` IS `value`.
      *
      * For non-boolean columns, this is only relevant for checking if the value of
      * `column` is NULL by setting `value` to `null`.
      *
      * For boolean columns, you can also set `value` to `true` or `false` and it
      * will behave the same way as `.eq()`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      is(column, value) {
        this.url.searchParams.append(column, `is.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` IS DISTINCT FROM `value`.
      *
      * Unlike `.neq()`, this treats `NULL` as a comparable value. Two `NULL` values
      * are considered equal (not distinct), and comparing `NULL` with any non-NULL
      * value returns true (distinct).
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      isDistinct(column, value) {
        this.url.searchParams.append(column, `isdistinct.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is included in the `values` array.
      *
      * @param column - The column to filter on
      * @param values - The values array to filter with
      */
      in(column, values) {
        const cleanedValues = Array.from(new Set(values)).map((s) => {
          if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
          else return `${s}`;
        }).join(",");
        this.url.searchParams.append(column, `in.(${cleanedValues})`);
        return this;
      }
      /**
      * Match only rows where `column` is NOT included in the `values` array.
      *
      * @param column - The column to filter on
      * @param values - The values array to filter with
      */
      notIn(column, values) {
        const cleanedValues = Array.from(new Set(values)).map((s) => {
          if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
          else return `${s}`;
        }).join(",");
        this.url.searchParams.append(column, `not.in.(${cleanedValues})`);
        return this;
      }
      /**
      * Only relevant for jsonb, array, and range columns. Match only rows where
      * `column` contains every element appearing in `value`.
      *
      * @param column - The jsonb, array, or range column to filter on
      * @param value - The jsonb, array, or range value to filter with
      */
      contains(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `cs.${value}`);
        else if (Array.isArray(value)) this.url.searchParams.append(column, `cs.{${value.join(",")}}`);
        else this.url.searchParams.append(column, `cs.${JSON.stringify(value)}`);
        return this;
      }
      /**
      * Only relevant for jsonb, array, and range columns. Match only rows where
      * every element appearing in `column` is contained by `value`.
      *
      * @param column - The jsonb, array, or range column to filter on
      * @param value - The jsonb, array, or range value to filter with
      */
      containedBy(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `cd.${value}`);
        else if (Array.isArray(value)) this.url.searchParams.append(column, `cd.{${value.join(",")}}`);
        else this.url.searchParams.append(column, `cd.${JSON.stringify(value)}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is greater than any element in `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeGt(column, range) {
        this.url.searchParams.append(column, `sr.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is either contained in `range` or greater than any element in
      * `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeGte(column, range) {
        this.url.searchParams.append(column, `nxl.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is less than any element in `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeLt(column, range) {
        this.url.searchParams.append(column, `sl.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is either contained in `range` or less than any element in
      * `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeLte(column, range) {
        this.url.searchParams.append(column, `nxr.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where `column` is
      * mutually exclusive to `range` and there can be no element between the two
      * ranges.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeAdjacent(column, range) {
        this.url.searchParams.append(column, `adj.${range}`);
        return this;
      }
      /**
      * Only relevant for array and range columns. Match only rows where
      * `column` and `value` have an element in common.
      *
      * @param column - The array or range column to filter on
      * @param value - The array or range value to filter with
      */
      overlaps(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `ov.${value}`);
        else this.url.searchParams.append(column, `ov.{${value.join(",")}}`);
        return this;
      }
      /**
      * Only relevant for text and tsvector columns. Match only rows where
      * `column` matches the query string in `query`.
      *
      * @param column - The text or tsvector column to filter on
      * @param query - The query text to match with
      * @param options - Named parameters
      * @param options.config - The text search configuration to use
      * @param options.type - Change how the `query` text is interpreted
      */
      textSearch(column, query, { config, type } = {}) {
        let typePart = "";
        if (type === "plain") typePart = "pl";
        else if (type === "phrase") typePart = "ph";
        else if (type === "websearch") typePart = "w";
        const configPart = config === void 0 ? "" : `(${config})`;
        this.url.searchParams.append(column, `${typePart}fts${configPart}.${query}`);
        return this;
      }
      /**
      * Match only rows where each column in `query` keys is equal to its
      * associated value. Shorthand for multiple `.eq()`s.
      *
      * @param query - The object to filter with, with column names as keys mapped
      * to their filter values
      */
      match(query) {
        Object.entries(query).forEach(([column, value]) => {
          this.url.searchParams.append(column, `eq.${value}`);
        });
        return this;
      }
      /**
      * Match only rows which doesn't satisfy the filter.
      *
      * Unlike most filters, `opearator` and `value` are used as-is and need to
      * follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure they are properly sanitized.
      *
      * @param column - The column to filter on
      * @param operator - The operator to be negated to filter with, following
      * PostgREST syntax
      * @param value - The value to filter with, following PostgREST syntax
      */
      not(column, operator, value) {
        this.url.searchParams.append(column, `not.${operator}.${value}`);
        return this;
      }
      /**
      * Match only rows which satisfy at least one of the filters.
      *
      * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure it's properly sanitized.
      *
      * It's currently not possible to do an `.or()` filter across multiple tables.
      *
      * @param filters - The filters to use, following PostgREST syntax
      * @param options - Named parameters
      * @param options.referencedTable - Set this to filter on referenced tables
      * instead of the parent table
      * @param options.foreignTable - Deprecated, use `referencedTable` instead
      */
      or(filters, { foreignTable, referencedTable = foreignTable } = {}) {
        const key = referencedTable ? `${referencedTable}.or` : "or";
        this.url.searchParams.append(key, `(${filters})`);
        return this;
      }
      /**
      * Match only rows which satisfy the filter. This is an escape hatch - you
      * should use the specific filter methods wherever possible.
      *
      * Unlike most filters, `opearator` and `value` are used as-is and need to
      * follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure they are properly sanitized.
      *
      * @param column - The column to filter on
      * @param operator - The operator to filter with, following PostgREST syntax
      * @param value - The value to filter with, following PostgREST syntax
      */
      filter(column, operator, value) {
        this.url.searchParams.append(column, `${operator}.${value}`);
        return this;
      }
    };
    var PostgrestQueryBuilder = class {
      /**
      * Creates a query builder scoped to a Postgres table or view.
      *
      * @example
      * ```ts
      * import PostgrestQueryBuilder from '@supabase/postgrest-js'
      *
      * const query = new PostgrestQueryBuilder(
      *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
      *   { headers: { apikey: 'public-anon-key' } }
      * )
      * ```
      */
      constructor(url, { headers = {}, schema, fetch: fetch$1 }) {
        this.url = url;
        this.headers = new Headers(headers);
        this.schema = schema;
        this.fetch = fetch$1;
      }
      /**
      * Clone URL and headers to prevent shared state between operations.
      */
      cloneRequestState() {
        return {
          url: new URL(this.url.toString()),
          headers: new Headers(this.headers)
        };
      }
      /**
      * Perform a SELECT query on the table or view.
      *
      * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
      *
      * @param options - Named parameters
      *
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      *
      * @param options.count - Count algorithm to use to count rows in the table or view.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      select(columns, options) {
        const { head = false, count } = options !== null && options !== void 0 ? options : {};
        const method = head ? "HEAD" : "GET";
        let quoted = false;
        const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
          if (/\s/.test(c) && !quoted) return "";
          if (c === '"') quoted = !quoted;
          return c;
        }).join("");
        const { url, headers } = this.cloneRequestState();
        url.searchParams.set("select", cleanedColumns);
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          fetch: this.fetch
        });
      }
      /**
      * Perform an INSERT into the table or view.
      *
      * By default, inserted rows are not returned. To return it, chain the call
      * with `.select()`.
      *
      * @param values - The values to insert. Pass an object to insert a single row
      * or an array to insert multiple rows.
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count inserted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @param options.defaultToNull - Make missing fields default to `null`.
      * Otherwise, use the default value for the column. Only applies for bulk
      * inserts.
      */
      insert(values, { count, defaultToNull = true } = {}) {
        var _this$fetch;
        const method = "POST";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        if (!defaultToNull) headers.append("Prefer", `missing=default`);
        if (Array.isArray(values)) {
          const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
          if (columns.length > 0) {
            const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
            url.searchParams.set("columns", uniqueColumns.join(","));
          }
        }
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch
        });
      }
      /**
      * Perform an UPSERT on the table or view. Depending on the column(s) passed
      * to `onConflict`, `.upsert()` allows you to perform the equivalent of
      * `.insert()` if a row with the corresponding `onConflict` columns doesn't
      * exist, or if it does exist, perform an alternative action depending on
      * `ignoreDuplicates`.
      *
      * By default, upserted rows are not returned. To return it, chain the call
      * with `.select()`.
      *
      * @param values - The values to upsert with. Pass an object to upsert a
      * single row or an array to upsert multiple rows.
      *
      * @param options - Named parameters
      *
      * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
      * duplicate rows are determined. Two rows are duplicates if all the
      * `onConflict` columns are equal.
      *
      * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
      * `false`, duplicate rows are merged with existing rows.
      *
      * @param options.count - Count algorithm to use to count upserted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @param options.defaultToNull - Make missing fields default to `null`.
      * Otherwise, use the default value for the column. This only applies when
      * inserting new rows, not when merging with existing rows under
      * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
      *
      * @example Upsert a single row using a unique key
      * ```ts
      * // Upserting a single row, overwriting based on the 'username' unique column
      * const { data, error } = await supabase
      *   .from('users')
      *   .upsert({ username: 'supabot' }, { onConflict: 'username' })
      *
      * // Example response:
      * // {
      * //   data: [
      * //     { id: 4, message: 'bar', username: 'supabot' }
      * //   ],
      * //   error: null
      * // }
      * ```
      *
      * @example Upsert with conflict resolution and exact row counting
      * ```ts
      * // Upserting and returning exact count
      * const { data, error, count } = await supabase
      *   .from('users')
      *   .upsert(
      *     {
      *       id: 3,
      *       message: 'foo',
      *       username: 'supabot'
      *     },
      *     {
      *       onConflict: 'username',
      *       count: 'exact'
      *     }
      *   )
      *
      * // Example response:
      * // {
      * //   data: [
      * //     {
      * //       id: 42,
      * //       handle: "saoirse",
      * //       display_name: "Saoirse"
      * //     }
      * //   ],
      * //   count: 1,
      * //   error: null
      * // }
      * ```
      */
      upsert(values, { onConflict, ignoreDuplicates = false, count, defaultToNull = true } = {}) {
        var _this$fetch2;
        const method = "POST";
        const { url, headers } = this.cloneRequestState();
        headers.append("Prefer", `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates`);
        if (onConflict !== void 0) url.searchParams.set("on_conflict", onConflict);
        if (count) headers.append("Prefer", `count=${count}`);
        if (!defaultToNull) headers.append("Prefer", "missing=default");
        if (Array.isArray(values)) {
          const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
          if (columns.length > 0) {
            const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
            url.searchParams.set("columns", uniqueColumns.join(","));
          }
        }
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch2 = this.fetch) !== null && _this$fetch2 !== void 0 ? _this$fetch2 : fetch
        });
      }
      /**
      * Perform an UPDATE on the table or view.
      *
      * By default, updated rows are not returned. To return it, chain the call
      * with `.select()` after filters.
      *
      * @param values - The values to update with
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count updated rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      update(values, { count } = {}) {
        var _this$fetch3;
        const method = "PATCH";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch3 = this.fetch) !== null && _this$fetch3 !== void 0 ? _this$fetch3 : fetch
        });
      }
      /**
      * Perform a DELETE on the table or view.
      *
      * By default, deleted rows are not returned. To return it, chain the call
      * with `.select()` after filters.
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count deleted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      delete({ count } = {}) {
        var _this$fetch4;
        const method = "DELETE";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          fetch: (_this$fetch4 = this.fetch) !== null && _this$fetch4 !== void 0 ? _this$fetch4 : fetch
        });
      }
    };
    var PostgrestClient = class PostgrestClient2 {
      /**
      * Creates a PostgREST client.
      *
      * @param url - URL of the PostgREST endpoint
      * @param options - Named parameters
      * @param options.headers - Custom headers
      * @param options.schema - Postgres schema to switch to
      * @param options.fetch - Custom fetch
      * @example
      * ```ts
      * import PostgrestClient from '@supabase/postgrest-js'
      *
      * const postgrest = new PostgrestClient('https://xyzcompany.supabase.co/rest/v1', {
      *   headers: { apikey: 'public-anon-key' },
      *   schema: 'public',
      * })
      * ```
      */
      constructor(url, { headers = {}, schema, fetch: fetch$1 } = {}) {
        this.url = url;
        this.headers = new Headers(headers);
        this.schemaName = schema;
        this.fetch = fetch$1;
      }
      /**
      * Perform a query on a table or a view.
      *
      * @param relation - The table or view name to query
      */
      from(relation) {
        if (!relation || typeof relation !== "string" || relation.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
        return new PostgrestQueryBuilder(new URL(`${this.url}/${relation}`), {
          headers: new Headers(this.headers),
          schema: this.schemaName,
          fetch: this.fetch
        });
      }
      /**
      * Select a schema to query or perform an function (rpc) call.
      *
      * The schema needs to be on the list of exposed schemas inside Supabase.
      *
      * @param schema - The schema to query
      */
      schema(schema) {
        return new PostgrestClient2(this.url, {
          headers: this.headers,
          schema,
          fetch: this.fetch
        });
      }
      /**
      * Perform a function call.
      *
      * @param fn - The function name to call
      * @param args - The arguments to pass to the function call
      * @param options - Named parameters
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      * @param options.get - When set to `true`, the function will be called with
      * read-only access mode.
      * @param options.count - Count algorithm to use to count rows returned by the
      * function. Only applicable for [set-returning
      * functions](https://www.postgresql.org/docs/current/functions-srf.html).
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @example
      * ```ts
      * // For cross-schema functions where type inference fails, use overrideTypes:
      * const { data } = await supabase
      *   .schema('schema_b')
      *   .rpc('function_a', {})
      *   .overrideTypes<{ id: string; user_id: string }[]>()
      * ```
      */
      rpc(fn, args = {}, { head = false, get = false, count } = {}) {
        var _this$fetch;
        let method;
        const url = new URL(`${this.url}/rpc/${fn}`);
        let body;
        const _isObject = (v) => v !== null && typeof v === "object" && (!Array.isArray(v) || v.some(_isObject));
        const _hasObjectArg = head && Object.values(args).some(_isObject);
        if (_hasObjectArg) {
          method = "POST";
          body = args;
        } else if (head || get) {
          method = head ? "HEAD" : "GET";
          Object.entries(args).filter(([_, value]) => value !== void 0).map(([name, value]) => [name, Array.isArray(value) ? `{${value.join(",")}}` : `${value}`]).forEach(([name, value]) => {
            url.searchParams.append(name, value);
          });
        } else {
          method = "POST";
          body = args;
        }
        const headers = new Headers(this.headers);
        if (_hasObjectArg) headers.set("Prefer", count ? `count=${count},return=minimal` : "return=minimal");
        else if (count) headers.set("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schemaName,
          body,
          fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch
        });
      }
    };
    var src_default = {
      PostgrestClient,
      PostgrestQueryBuilder,
      PostgrestFilterBuilder,
      PostgrestTransformBuilder,
      PostgrestBuilder,
      PostgrestError: PostgrestError2
    };
    exports.PostgrestBuilder = PostgrestBuilder;
    exports.PostgrestClient = PostgrestClient;
    exports.PostgrestError = PostgrestError2;
    exports.PostgrestFilterBuilder = PostgrestFilterBuilder;
    exports.PostgrestQueryBuilder = PostgrestQueryBuilder;
    exports.PostgrestTransformBuilder = PostgrestTransformBuilder;
    exports.default = src_default;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js
var require_websocket_factory = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebSocketFactory = void 0;
    var WebSocketFactory = class {
      /**
       * Static-only utility – prevent instantiation.
       */
      constructor() {
      }
      static detectEnvironment() {
        var _a;
        if (typeof WebSocket !== "undefined") {
          return { type: "native", constructor: WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket !== "undefined") {
          return { type: "native", constructor: globalThis.WebSocket };
        }
        if (typeof global !== "undefined" && typeof global.WebSocket !== "undefined") {
          return { type: "native", constructor: global.WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocketPair !== "undefined" && typeof globalThis.WebSocket === "undefined") {
          return {
            type: "cloudflare",
            error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
            workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
          };
        }
        if (typeof globalThis !== "undefined" && globalThis.EdgeRuntime || typeof navigator !== "undefined" && ((_a = navigator.userAgent) === null || _a === void 0 ? void 0 : _a.includes("Vercel-Edge"))) {
          return {
            type: "unsupported",
            error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
            workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
          };
        }
        const _process = globalThis["process"];
        if (_process) {
          const processVersions = _process["versions"];
          if (processVersions && processVersions["node"]) {
            const versionString = processVersions["node"];
            const nodeVersion = parseInt(versionString.replace(/^v/, "").split(".")[0]);
            if (nodeVersion >= 22) {
              if (typeof globalThis.WebSocket !== "undefined") {
                return { type: "native", constructor: globalThis.WebSocket };
              }
              return {
                type: "unsupported",
                error: `Node.js ${nodeVersion} detected but native WebSocket not found.`,
                workaround: "Provide a WebSocket implementation via the transport option."
              };
            }
            return {
              type: "unsupported",
              error: `Node.js ${nodeVersion} detected without native WebSocket support.`,
              workaround: 'For Node.js < 22, install "ws" package and provide it via the transport option:\nimport ws from "ws"\nnew RealtimeClient(url, { transport: ws })'
            };
          }
        }
        return {
          type: "unsupported",
          error: "Unknown JavaScript runtime without WebSocket support.",
          workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
        };
      }
      /**
       * Returns the best available WebSocket constructor for the current runtime.
       *
       * @example
       * ```ts
       * const WS = WebSocketFactory.getWebSocketConstructor()
       * const socket = new WS('wss://realtime.supabase.co/socket')
       * ```
       */
      static getWebSocketConstructor() {
        const env = this.detectEnvironment();
        if (env.constructor) {
          return env.constructor;
        }
        let errorMessage = env.error || "WebSocket not supported in this environment.";
        if (env.workaround) {
          errorMessage += `

Suggested solution: ${env.workaround}`;
        }
        throw new Error(errorMessage);
      }
      /**
       * Creates a WebSocket using the detected constructor.
       *
       * @example
       * ```ts
       * const socket = WebSocketFactory.createWebSocket('wss://realtime.supabase.co/socket')
       * ```
       */
      static createWebSocket(url, protocols) {
        const WS = this.getWebSocketConstructor();
        return new WS(url, protocols);
      }
      /**
       * Detects whether the runtime can establish WebSocket connections.
       *
       * @example
       * ```ts
       * if (!WebSocketFactory.isWebSocketSupported()) {
       *   console.warn('Falling back to long polling')
       * }
       * ```
       */
      static isWebSocketSupported() {
        try {
          const env = this.detectEnvironment();
          return env.type === "native" || env.type === "ws";
        } catch (_a) {
          return false;
        }
      }
    };
    exports.WebSocketFactory = WebSocketFactory;
    exports.default = WebSocketFactory;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/version.js
var require_version = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "2.91.1";
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CONNECTION_STATE = exports.TRANSPORTS = exports.CHANNEL_EVENTS = exports.CHANNEL_STATES = exports.SOCKET_STATES = exports.MAX_PUSH_BUFFER_SIZE = exports.WS_CLOSE_NORMAL = exports.DEFAULT_TIMEOUT = exports.VERSION = exports.DEFAULT_VSN = exports.VSN_2_0_0 = exports.VSN_1_0_0 = exports.DEFAULT_VERSION = void 0;
    var version_1 = require_version();
    exports.DEFAULT_VERSION = `realtime-js/${version_1.version}`;
    exports.VSN_1_0_0 = "1.0.0";
    exports.VSN_2_0_0 = "2.0.0";
    exports.DEFAULT_VSN = exports.VSN_2_0_0;
    exports.VERSION = version_1.version;
    exports.DEFAULT_TIMEOUT = 1e4;
    exports.WS_CLOSE_NORMAL = 1e3;
    exports.MAX_PUSH_BUFFER_SIZE = 100;
    var SOCKET_STATES;
    (function(SOCKET_STATES2) {
      SOCKET_STATES2[SOCKET_STATES2["connecting"] = 0] = "connecting";
      SOCKET_STATES2[SOCKET_STATES2["open"] = 1] = "open";
      SOCKET_STATES2[SOCKET_STATES2["closing"] = 2] = "closing";
      SOCKET_STATES2[SOCKET_STATES2["closed"] = 3] = "closed";
    })(SOCKET_STATES || (exports.SOCKET_STATES = SOCKET_STATES = {}));
    var CHANNEL_STATES;
    (function(CHANNEL_STATES2) {
      CHANNEL_STATES2["closed"] = "closed";
      CHANNEL_STATES2["errored"] = "errored";
      CHANNEL_STATES2["joined"] = "joined";
      CHANNEL_STATES2["joining"] = "joining";
      CHANNEL_STATES2["leaving"] = "leaving";
    })(CHANNEL_STATES || (exports.CHANNEL_STATES = CHANNEL_STATES = {}));
    var CHANNEL_EVENTS;
    (function(CHANNEL_EVENTS2) {
      CHANNEL_EVENTS2["close"] = "phx_close";
      CHANNEL_EVENTS2["error"] = "phx_error";
      CHANNEL_EVENTS2["join"] = "phx_join";
      CHANNEL_EVENTS2["reply"] = "phx_reply";
      CHANNEL_EVENTS2["leave"] = "phx_leave";
      CHANNEL_EVENTS2["access_token"] = "access_token";
    })(CHANNEL_EVENTS || (exports.CHANNEL_EVENTS = CHANNEL_EVENTS = {}));
    var TRANSPORTS;
    (function(TRANSPORTS2) {
      TRANSPORTS2["websocket"] = "websocket";
    })(TRANSPORTS || (exports.TRANSPORTS = TRANSPORTS = {}));
    var CONNECTION_STATE;
    (function(CONNECTION_STATE2) {
      CONNECTION_STATE2["Connecting"] = "connecting";
      CONNECTION_STATE2["Open"] = "open";
      CONNECTION_STATE2["Closing"] = "closing";
      CONNECTION_STATE2["Closed"] = "closed";
    })(CONNECTION_STATE || (exports.CONNECTION_STATE = CONNECTION_STATE = {}));
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/serializer.js
var require_serializer = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/serializer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Serializer = class {
      constructor(allowedMetadataKeys) {
        this.HEADER_LENGTH = 1;
        this.USER_BROADCAST_PUSH_META_LENGTH = 6;
        this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 };
        this.BINARY_ENCODING = 0;
        this.JSON_ENCODING = 1;
        this.BROADCAST_EVENT = "broadcast";
        this.allowedMetadataKeys = [];
        this.allowedMetadataKeys = allowedMetadataKeys !== null && allowedMetadataKeys !== void 0 ? allowedMetadataKeys : [];
      }
      encode(msg, callback) {
        if (msg.event === this.BROADCAST_EVENT && !(msg.payload instanceof ArrayBuffer) && typeof msg.payload.event === "string") {
          return callback(this._binaryEncodeUserBroadcastPush(msg));
        }
        let payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
        return callback(JSON.stringify(payload));
      }
      _binaryEncodeUserBroadcastPush(message) {
        var _a;
        if (this._isArrayBuffer((_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload)) {
          return this._encodeBinaryUserBroadcastPush(message);
        } else {
          return this._encodeJsonUserBroadcastPush(message);
        }
      }
      _encodeBinaryUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : new ArrayBuffer(0);
        return this._encodeUserBroadcastPush(message, this.BINARY_ENCODING, userPayload);
      }
      _encodeJsonUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : {};
        const encoder = new TextEncoder();
        const encodedUserPayload = encoder.encode(JSON.stringify(userPayload)).buffer;
        return this._encodeUserBroadcastPush(message, this.JSON_ENCODING, encodedUserPayload);
      }
      _encodeUserBroadcastPush(message, encodingType, encodedPayload) {
        var _a, _b;
        const topic = message.topic;
        const ref = (_a = message.ref) !== null && _a !== void 0 ? _a : "";
        const joinRef = (_b = message.join_ref) !== null && _b !== void 0 ? _b : "";
        const userEvent = message.payload.event;
        const rest = this.allowedMetadataKeys ? this._pick(message.payload, this.allowedMetadataKeys) : {};
        const metadata = Object.keys(rest).length === 0 ? "" : JSON.stringify(rest);
        if (joinRef.length > 255) {
          throw new Error(`joinRef length ${joinRef.length} exceeds maximum of 255`);
        }
        if (ref.length > 255) {
          throw new Error(`ref length ${ref.length} exceeds maximum of 255`);
        }
        if (topic.length > 255) {
          throw new Error(`topic length ${topic.length} exceeds maximum of 255`);
        }
        if (userEvent.length > 255) {
          throw new Error(`userEvent length ${userEvent.length} exceeds maximum of 255`);
        }
        if (metadata.length > 255) {
          throw new Error(`metadata length ${metadata.length} exceeds maximum of 255`);
        }
        const metaLength = this.USER_BROADCAST_PUSH_META_LENGTH + joinRef.length + ref.length + topic.length + userEvent.length + metadata.length;
        const header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
        let view = new DataView(header);
        let offset = 0;
        view.setUint8(offset++, this.KINDS.userBroadcastPush);
        view.setUint8(offset++, joinRef.length);
        view.setUint8(offset++, ref.length);
        view.setUint8(offset++, topic.length);
        view.setUint8(offset++, userEvent.length);
        view.setUint8(offset++, metadata.length);
        view.setUint8(offset++, encodingType);
        Array.from(joinRef, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(ref, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(topic, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(userEvent, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(metadata, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        var combined = new Uint8Array(header.byteLength + encodedPayload.byteLength);
        combined.set(new Uint8Array(header), 0);
        combined.set(new Uint8Array(encodedPayload), header.byteLength);
        return combined.buffer;
      }
      decode(rawPayload, callback) {
        if (this._isArrayBuffer(rawPayload)) {
          let result = this._binaryDecode(rawPayload);
          return callback(result);
        }
        if (typeof rawPayload === "string") {
          const jsonPayload = JSON.parse(rawPayload);
          const [join_ref, ref, topic, event, payload] = jsonPayload;
          return callback({ join_ref, ref, topic, event, payload });
        }
        return callback({});
      }
      _binaryDecode(buffer) {
        const view = new DataView(buffer);
        const kind = view.getUint8(0);
        const decoder = new TextDecoder();
        switch (kind) {
          case this.KINDS.userBroadcast:
            return this._decodeUserBroadcast(buffer, view, decoder);
        }
      }
      _decodeUserBroadcast(buffer, view, decoder) {
        const topicSize = view.getUint8(1);
        const userEventSize = view.getUint8(2);
        const metadataSize = view.getUint8(3);
        const payloadEncoding = view.getUint8(4);
        let offset = this.HEADER_LENGTH + 4;
        const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
        offset = offset + topicSize;
        const userEvent = decoder.decode(buffer.slice(offset, offset + userEventSize));
        offset = offset + userEventSize;
        const metadata = decoder.decode(buffer.slice(offset, offset + metadataSize));
        offset = offset + metadataSize;
        const payload = buffer.slice(offset, buffer.byteLength);
        const parsedPayload = payloadEncoding === this.JSON_ENCODING ? JSON.parse(decoder.decode(payload)) : payload;
        const data = {
          type: this.BROADCAST_EVENT,
          event: userEvent,
          payload: parsedPayload
        };
        if (metadataSize > 0) {
          data["meta"] = JSON.parse(metadata);
        }
        return { join_ref: null, ref: null, topic, event: this.BROADCAST_EVENT, payload: data };
      }
      _isArrayBuffer(buffer) {
        var _a;
        return buffer instanceof ArrayBuffer || ((_a = buffer === null || buffer === void 0 ? void 0 : buffer.constructor) === null || _a === void 0 ? void 0 : _a.name) === "ArrayBuffer";
      }
      _pick(obj, keys) {
        if (!obj || typeof obj !== "object") {
          return {};
        }
        return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
      }
    };
    exports.default = Serializer;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/timer.js
var require_timer = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/timer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Timer = class {
      constructor(callback, timerCalc) {
        this.callback = callback;
        this.timerCalc = timerCalc;
        this.timer = void 0;
        this.tries = 0;
        this.callback = callback;
        this.timerCalc = timerCalc;
      }
      reset() {
        this.tries = 0;
        clearTimeout(this.timer);
        this.timer = void 0;
      }
      // Cancels any previous scheduleTimeout and schedules callback
      scheduleTimeout() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.tries = this.tries + 1;
          this.callback();
        }, this.timerCalc(this.tries + 1));
      }
    };
    exports.default = Timer;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/transformers.js
var require_transformers = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/transformers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.httpEndpointURL = exports.toTimestampString = exports.toArray = exports.toJson = exports.toNumber = exports.toBoolean = exports.convertCell = exports.convertColumn = exports.convertChangeData = exports.PostgresTypes = void 0;
    var PostgresTypes;
    (function(PostgresTypes2) {
      PostgresTypes2["abstime"] = "abstime";
      PostgresTypes2["bool"] = "bool";
      PostgresTypes2["date"] = "date";
      PostgresTypes2["daterange"] = "daterange";
      PostgresTypes2["float4"] = "float4";
      PostgresTypes2["float8"] = "float8";
      PostgresTypes2["int2"] = "int2";
      PostgresTypes2["int4"] = "int4";
      PostgresTypes2["int4range"] = "int4range";
      PostgresTypes2["int8"] = "int8";
      PostgresTypes2["int8range"] = "int8range";
      PostgresTypes2["json"] = "json";
      PostgresTypes2["jsonb"] = "jsonb";
      PostgresTypes2["money"] = "money";
      PostgresTypes2["numeric"] = "numeric";
      PostgresTypes2["oid"] = "oid";
      PostgresTypes2["reltime"] = "reltime";
      PostgresTypes2["text"] = "text";
      PostgresTypes2["time"] = "time";
      PostgresTypes2["timestamp"] = "timestamp";
      PostgresTypes2["timestamptz"] = "timestamptz";
      PostgresTypes2["timetz"] = "timetz";
      PostgresTypes2["tsrange"] = "tsrange";
      PostgresTypes2["tstzrange"] = "tstzrange";
    })(PostgresTypes || (exports.PostgresTypes = PostgresTypes = {}));
    var convertChangeData = (columns, record, options = {}) => {
      var _a;
      const skipTypes = (_a = options.skipTypes) !== null && _a !== void 0 ? _a : [];
      if (!record) {
        return {};
      }
      return Object.keys(record).reduce((acc, rec_key) => {
        acc[rec_key] = (0, exports.convertColumn)(rec_key, columns, record, skipTypes);
        return acc;
      }, {});
    };
    exports.convertChangeData = convertChangeData;
    var convertColumn = (columnName, columns, record, skipTypes) => {
      const column = columns.find((x) => x.name === columnName);
      const colType = column === null || column === void 0 ? void 0 : column.type;
      const value = record[columnName];
      if (colType && !skipTypes.includes(colType)) {
        return (0, exports.convertCell)(colType, value);
      }
      return noop(value);
    };
    exports.convertColumn = convertColumn;
    var convertCell = (type, value) => {
      if (type.charAt(0) === "_") {
        const dataType = type.slice(1, type.length);
        return (0, exports.toArray)(value, dataType);
      }
      switch (type) {
        case PostgresTypes.bool:
          return (0, exports.toBoolean)(value);
        case PostgresTypes.float4:
        case PostgresTypes.float8:
        case PostgresTypes.int2:
        case PostgresTypes.int4:
        case PostgresTypes.int8:
        case PostgresTypes.numeric:
        case PostgresTypes.oid:
          return (0, exports.toNumber)(value);
        case PostgresTypes.json:
        case PostgresTypes.jsonb:
          return (0, exports.toJson)(value);
        case PostgresTypes.timestamp:
          return (0, exports.toTimestampString)(value);
        // Format to be consistent with PostgREST
        case PostgresTypes.abstime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.date:
        // To allow users to cast it based on Timezone
        case PostgresTypes.daterange:
        case PostgresTypes.int4range:
        case PostgresTypes.int8range:
        case PostgresTypes.money:
        case PostgresTypes.reltime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.text:
        case PostgresTypes.time:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timestamptz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timetz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.tsrange:
        case PostgresTypes.tstzrange:
          return noop(value);
        default:
          return noop(value);
      }
    };
    exports.convertCell = convertCell;
    var noop = (value) => {
      return value;
    };
    var toBoolean = (value) => {
      switch (value) {
        case "t":
          return true;
        case "f":
          return false;
        default:
          return value;
      }
    };
    exports.toBoolean = toBoolean;
    var toNumber = (value) => {
      if (typeof value === "string") {
        const parsedValue = parseFloat(value);
        if (!Number.isNaN(parsedValue)) {
          return parsedValue;
        }
      }
      return value;
    };
    exports.toNumber = toNumber;
    var toJson = (value) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (_a) {
          return value;
        }
      }
      return value;
    };
    exports.toJson = toJson;
    var toArray = (value, type) => {
      if (typeof value !== "string") {
        return value;
      }
      const lastIdx = value.length - 1;
      const closeBrace = value[lastIdx];
      const openBrace = value[0];
      if (openBrace === "{" && closeBrace === "}") {
        let arr;
        const valTrim = value.slice(1, lastIdx);
        try {
          arr = JSON.parse("[" + valTrim + "]");
        } catch (_) {
          arr = valTrim ? valTrim.split(",") : [];
        }
        return arr.map((val) => (0, exports.convertCell)(type, val));
      }
      return value;
    };
    exports.toArray = toArray;
    var toTimestampString = (value) => {
      if (typeof value === "string") {
        return value.replace(" ", "T");
      }
      return value;
    };
    exports.toTimestampString = toTimestampString;
    var httpEndpointURL = (socketUrl) => {
      const wsUrl = new URL(socketUrl);
      wsUrl.protocol = wsUrl.protocol.replace(/^ws/i, "http");
      wsUrl.pathname = wsUrl.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, "");
      if (wsUrl.pathname === "" || wsUrl.pathname === "/") {
        wsUrl.pathname = "/api/broadcast";
      } else {
        wsUrl.pathname = wsUrl.pathname + "/api/broadcast";
      }
      return wsUrl.href;
    };
    exports.httpEndpointURL = httpEndpointURL;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/push.js
var require_push = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/lib/push.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var constants_1 = require_constants();
    var Push = class {
      /**
       * Initializes the Push
       *
       * @param channel The Channel
       * @param event The event, for example `"phx_join"`
       * @param payload The payload, for example `{user_id: 123}`
       * @param timeout The push timeout in milliseconds
       */
      constructor(channel, event, payload = {}, timeout = constants_1.DEFAULT_TIMEOUT) {
        this.channel = channel;
        this.event = event;
        this.payload = payload;
        this.timeout = timeout;
        this.sent = false;
        this.timeoutTimer = void 0;
        this.ref = "";
        this.receivedResp = null;
        this.recHooks = [];
        this.refEvent = null;
      }
      resend(timeout) {
        this.timeout = timeout;
        this._cancelRefEvent();
        this.ref = "";
        this.refEvent = null;
        this.receivedResp = null;
        this.sent = false;
        this.send();
      }
      send() {
        if (this._hasReceived("timeout")) {
          return;
        }
        this.startTimeout();
        this.sent = true;
        this.channel.socket.push({
          topic: this.channel.topic,
          event: this.event,
          payload: this.payload,
          ref: this.ref,
          join_ref: this.channel._joinRef()
        });
      }
      updatePayload(payload) {
        this.payload = Object.assign(Object.assign({}, this.payload), payload);
      }
      receive(status, callback) {
        var _a;
        if (this._hasReceived(status)) {
          callback((_a = this.receivedResp) === null || _a === void 0 ? void 0 : _a.response);
        }
        this.recHooks.push({ status, callback });
        return this;
      }
      startTimeout() {
        if (this.timeoutTimer) {
          return;
        }
        this.ref = this.channel.socket._makeRef();
        this.refEvent = this.channel._replyEventName(this.ref);
        const callback = (payload) => {
          this._cancelRefEvent();
          this._cancelTimeout();
          this.receivedResp = payload;
          this._matchReceive(payload);
        };
        this.channel._on(this.refEvent, {}, callback);
        this.timeoutTimer = setTimeout(() => {
          this.trigger("timeout", {});
        }, this.timeout);
      }
      trigger(status, response) {
        if (this.refEvent)
          this.channel._trigger(this.refEvent, { status, response });
      }
      destroy() {
        this._cancelRefEvent();
        this._cancelTimeout();
      }
      _cancelRefEvent() {
        if (!this.refEvent) {
          return;
        }
        this.channel._off(this.refEvent, {});
      }
      _cancelTimeout() {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = void 0;
      }
      _matchReceive({ status, response }) {
        this.recHooks.filter((h) => h.status === status).forEach((h) => h.callback(response));
      }
      _hasReceived(status) {
        return this.receivedResp && this.receivedResp.status === status;
      }
    };
    exports.default = Push;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/RealtimePresence.js
var require_RealtimePresence = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/RealtimePresence.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REALTIME_PRESENCE_LISTEN_EVENTS = void 0;
    var REALTIME_PRESENCE_LISTEN_EVENTS2;
    (function(REALTIME_PRESENCE_LISTEN_EVENTS3) {
      REALTIME_PRESENCE_LISTEN_EVENTS3["SYNC"] = "sync";
      REALTIME_PRESENCE_LISTEN_EVENTS3["JOIN"] = "join";
      REALTIME_PRESENCE_LISTEN_EVENTS3["LEAVE"] = "leave";
    })(REALTIME_PRESENCE_LISTEN_EVENTS2 || (exports.REALTIME_PRESENCE_LISTEN_EVENTS = REALTIME_PRESENCE_LISTEN_EVENTS2 = {}));
    var RealtimePresence2 = class _RealtimePresence {
      /**
       * Creates a Presence helper that keeps the local presence state in sync with the server.
       *
       * @param channel - The realtime channel to bind to.
       * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
       *
       * @example
       * ```ts
       * const presence = new RealtimePresence(channel)
       *
       * channel.on('presence', ({ event, key }) => {
       *   console.log(`Presence ${event} on ${key}`)
       * })
       * ```
       */
      constructor(channel, opts) {
        this.channel = channel;
        this.state = {};
        this.pendingDiffs = [];
        this.joinRef = null;
        this.enabled = false;
        this.caller = {
          onJoin: () => {
          },
          onLeave: () => {
          },
          onSync: () => {
          }
        };
        const events = (opts === null || opts === void 0 ? void 0 : opts.events) || {
          state: "presence_state",
          diff: "presence_diff"
        };
        this.channel._on(events.state, {}, (newState) => {
          const { onJoin, onLeave, onSync } = this.caller;
          this.joinRef = this.channel._joinRef();
          this.state = _RealtimePresence.syncState(this.state, newState, onJoin, onLeave);
          this.pendingDiffs.forEach((diff) => {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
          });
          this.pendingDiffs = [];
          onSync();
        });
        this.channel._on(events.diff, {}, (diff) => {
          const { onJoin, onLeave, onSync } = this.caller;
          if (this.inPendingSyncState()) {
            this.pendingDiffs.push(diff);
          } else {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
            onSync();
          }
        });
        this.onJoin((key, currentPresences, newPresences) => {
          this.channel._trigger("presence", {
            event: "join",
            key,
            currentPresences,
            newPresences
          });
        });
        this.onLeave((key, currentPresences, leftPresences) => {
          this.channel._trigger("presence", {
            event: "leave",
            key,
            currentPresences,
            leftPresences
          });
        });
        this.onSync(() => {
          this.channel._trigger("presence", { event: "sync" });
        });
      }
      /**
       * Used to sync the list of presences on the server with the
       * client's state.
       *
       * An optional `onJoin` and `onLeave` callback can be provided to
       * react to changes in the client's local presences across
       * disconnects and reconnects with the server.
       *
       * @internal
       */
      static syncState(currentState, newState, onJoin, onLeave) {
        const state3 = this.cloneDeep(currentState);
        const transformedState = this.transformState(newState);
        const joins = {};
        const leaves = {};
        this.map(state3, (key, presences) => {
          if (!transformedState[key]) {
            leaves[key] = presences;
          }
        });
        this.map(transformedState, (key, newPresences) => {
          const currentPresences = state3[key];
          if (currentPresences) {
            const newPresenceRefs = newPresences.map((m) => m.presence_ref);
            const curPresenceRefs = currentPresences.map((m) => m.presence_ref);
            const joinedPresences = newPresences.filter((m) => curPresenceRefs.indexOf(m.presence_ref) < 0);
            const leftPresences = currentPresences.filter((m) => newPresenceRefs.indexOf(m.presence_ref) < 0);
            if (joinedPresences.length > 0) {
              joins[key] = joinedPresences;
            }
            if (leftPresences.length > 0) {
              leaves[key] = leftPresences;
            }
          } else {
            joins[key] = newPresences;
          }
        });
        return this.syncDiff(state3, { joins, leaves }, onJoin, onLeave);
      }
      /**
       * Used to sync a diff of presence join and leave events from the
       * server, as they happen.
       *
       * Like `syncState`, `syncDiff` accepts optional `onJoin` and
       * `onLeave` callbacks to react to a user joining or leaving from a
       * device.
       *
       * @internal
       */
      static syncDiff(state3, diff, onJoin, onLeave) {
        const { joins, leaves } = {
          joins: this.transformState(diff.joins),
          leaves: this.transformState(diff.leaves)
        };
        if (!onJoin) {
          onJoin = () => {
          };
        }
        if (!onLeave) {
          onLeave = () => {
          };
        }
        this.map(joins, (key, newPresences) => {
          var _a;
          const currentPresences = (_a = state3[key]) !== null && _a !== void 0 ? _a : [];
          state3[key] = this.cloneDeep(newPresences);
          if (currentPresences.length > 0) {
            const joinedPresenceRefs = state3[key].map((m) => m.presence_ref);
            const curPresences = currentPresences.filter((m) => joinedPresenceRefs.indexOf(m.presence_ref) < 0);
            state3[key].unshift(...curPresences);
          }
          onJoin(key, currentPresences, newPresences);
        });
        this.map(leaves, (key, leftPresences) => {
          let currentPresences = state3[key];
          if (!currentPresences)
            return;
          const presenceRefsToRemove = leftPresences.map((m) => m.presence_ref);
          currentPresences = currentPresences.filter((m) => presenceRefsToRemove.indexOf(m.presence_ref) < 0);
          state3[key] = currentPresences;
          onLeave(key, currentPresences, leftPresences);
          if (currentPresences.length === 0)
            delete state3[key];
        });
        return state3;
      }
      /** @internal */
      static map(obj, func) {
        return Object.getOwnPropertyNames(obj).map((key) => func(key, obj[key]));
      }
      /**
       * Remove 'metas' key
       * Change 'phx_ref' to 'presence_ref'
       * Remove 'phx_ref' and 'phx_ref_prev'
       *
       * @example
       * // returns {
       *  abc123: [
       *    { presence_ref: '2', user_id: 1 },
       *    { presence_ref: '3', user_id: 2 }
       *  ]
       * }
       * RealtimePresence.transformState({
       *  abc123: {
       *    metas: [
       *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
       *      { phx_ref: '3', user_id: 2 }
       *    ]
       *  }
       * })
       *
       * @internal
       */
      static transformState(state3) {
        state3 = this.cloneDeep(state3);
        return Object.getOwnPropertyNames(state3).reduce((newState, key) => {
          const presences = state3[key];
          if ("metas" in presences) {
            newState[key] = presences.metas.map((presence) => {
              presence["presence_ref"] = presence["phx_ref"];
              delete presence["phx_ref"];
              delete presence["phx_ref_prev"];
              return presence;
            });
          } else {
            newState[key] = presences;
          }
          return newState;
        }, {});
      }
      /** @internal */
      static cloneDeep(obj) {
        return JSON.parse(JSON.stringify(obj));
      }
      /** @internal */
      onJoin(callback) {
        this.caller.onJoin = callback;
      }
      /** @internal */
      onLeave(callback) {
        this.caller.onLeave = callback;
      }
      /** @internal */
      onSync(callback) {
        this.caller.onSync = callback;
      }
      /** @internal */
      inPendingSyncState() {
        return !this.joinRef || this.joinRef !== this.channel._joinRef();
      }
    };
    exports.default = RealtimePresence2;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js
var require_RealtimeChannel = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REALTIME_CHANNEL_STATES = exports.REALTIME_SUBSCRIBE_STATES = exports.REALTIME_LISTEN_TYPES = exports.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var constants_1 = require_constants();
    var push_1 = tslib_1.__importDefault(require_push());
    var timer_1 = tslib_1.__importDefault(require_timer());
    var RealtimePresence_1 = tslib_1.__importDefault(require_RealtimePresence());
    var Transformers = tslib_1.__importStar(require_transformers());
    var transformers_1 = require_transformers();
    var REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2;
    (function(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT3) {
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT3["ALL"] = "*";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT3["INSERT"] = "INSERT";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT3["UPDATE"] = "UPDATE";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT3["DELETE"] = "DELETE";
    })(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2 || (exports.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2 = {}));
    var REALTIME_LISTEN_TYPES2;
    (function(REALTIME_LISTEN_TYPES3) {
      REALTIME_LISTEN_TYPES3["BROADCAST"] = "broadcast";
      REALTIME_LISTEN_TYPES3["PRESENCE"] = "presence";
      REALTIME_LISTEN_TYPES3["POSTGRES_CHANGES"] = "postgres_changes";
      REALTIME_LISTEN_TYPES3["SYSTEM"] = "system";
    })(REALTIME_LISTEN_TYPES2 || (exports.REALTIME_LISTEN_TYPES = REALTIME_LISTEN_TYPES2 = {}));
    var REALTIME_SUBSCRIBE_STATES2;
    (function(REALTIME_SUBSCRIBE_STATES3) {
      REALTIME_SUBSCRIBE_STATES3["SUBSCRIBED"] = "SUBSCRIBED";
      REALTIME_SUBSCRIBE_STATES3["TIMED_OUT"] = "TIMED_OUT";
      REALTIME_SUBSCRIBE_STATES3["CLOSED"] = "CLOSED";
      REALTIME_SUBSCRIBE_STATES3["CHANNEL_ERROR"] = "CHANNEL_ERROR";
    })(REALTIME_SUBSCRIBE_STATES2 || (exports.REALTIME_SUBSCRIBE_STATES = REALTIME_SUBSCRIBE_STATES2 = {}));
    exports.REALTIME_CHANNEL_STATES = constants_1.CHANNEL_STATES;
    var RealtimeChannel2 = class _RealtimeChannel {
      /**
       * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
       *
       * The topic determines which realtime stream you are subscribing to. Config options let you
       * enable acknowledgement for broadcasts, presence tracking, or private channels.
       *
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
       * ```
       */
      constructor(topic, params = { config: {} }, socket) {
        var _a, _b;
        this.topic = topic;
        this.params = params;
        this.socket = socket;
        this.bindings = {};
        this.state = constants_1.CHANNEL_STATES.closed;
        this.joinedOnce = false;
        this.pushBuffer = [];
        this.subTopic = topic.replace(/^realtime:/i, "");
        this.params.config = Object.assign({
          broadcast: { ack: false, self: false },
          presence: { key: "", enabled: false },
          private: false
        }, params.config);
        this.timeout = this.socket.timeout;
        this.joinPush = new push_1.default(this, constants_1.CHANNEL_EVENTS.join, this.params, this.timeout);
        this.rejoinTimer = new timer_1.default(() => this._rejoinUntilConnected(), this.socket.reconnectAfterMs);
        this.joinPush.receive("ok", () => {
          this.state = constants_1.CHANNEL_STATES.joined;
          this.rejoinTimer.reset();
          this.pushBuffer.forEach((pushEvent) => pushEvent.send());
          this.pushBuffer = [];
        });
        this._onClose(() => {
          this.rejoinTimer.reset();
          this.socket.log("channel", `close ${this.topic} ${this._joinRef()}`);
          this.state = constants_1.CHANNEL_STATES.closed;
          this.socket._remove(this);
        });
        this._onError((reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("timeout", () => {
          if (!this._isJoining()) {
            return;
          }
          this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("error", (reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this._on(constants_1.CHANNEL_EVENTS.reply, {}, (payload, ref) => {
          this._trigger(this._replyEventName(ref), payload);
        });
        this.presence = new RealtimePresence_1.default(this);
        this.broadcastEndpointURL = (0, transformers_1.httpEndpointURL)(this.socket.endPoint);
        this.private = this.params.config.private || false;
        if (!this.private && ((_b = (_a = this.params.config) === null || _a === void 0 ? void 0 : _a.broadcast) === null || _b === void 0 ? void 0 : _b.replay)) {
          throw `tried to use replay on public channel '${this.topic}'. It must be a private channel.`;
        }
      }
      /** Subscribe registers your client with the server */
      subscribe(callback, timeout = this.timeout) {
        var _a, _b, _c;
        if (!this.socket.isConnected()) {
          this.socket.connect();
        }
        if (this.state == constants_1.CHANNEL_STATES.closed) {
          const { config: { broadcast, presence, private: isPrivate } } = this.params;
          const postgres_changes = (_b = (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.map((r) => r.filter)) !== null && _b !== void 0 ? _b : [];
          const presence_enabled = !!this.bindings[REALTIME_LISTEN_TYPES2.PRESENCE] && this.bindings[REALTIME_LISTEN_TYPES2.PRESENCE].length > 0 || ((_c = this.params.config.presence) === null || _c === void 0 ? void 0 : _c.enabled) === true;
          const accessTokenPayload = {};
          const config = {
            broadcast,
            presence: Object.assign(Object.assign({}, presence), { enabled: presence_enabled }),
            postgres_changes,
            private: isPrivate
          };
          if (this.socket.accessTokenValue) {
            accessTokenPayload.access_token = this.socket.accessTokenValue;
          }
          this._onError((e) => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES2.CHANNEL_ERROR, e));
          this._onClose(() => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES2.CLOSED));
          this.updateJoinPayload(Object.assign({ config }, accessTokenPayload));
          this.joinedOnce = true;
          this._rejoin(timeout);
          this.joinPush.receive("ok", async ({ postgres_changes: postgres_changes2 }) => {
            var _a2;
            if (!this.socket._isManualToken()) {
              this.socket.setAuth();
            }
            if (postgres_changes2 === void 0) {
              callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES2.SUBSCRIBED);
              return;
            } else {
              const clientPostgresBindings = this.bindings.postgres_changes;
              const bindingsLen = (_a2 = clientPostgresBindings === null || clientPostgresBindings === void 0 ? void 0 : clientPostgresBindings.length) !== null && _a2 !== void 0 ? _a2 : 0;
              const newPostgresBindings = [];
              for (let i = 0; i < bindingsLen; i++) {
                const clientPostgresBinding = clientPostgresBindings[i];
                const { filter: { event, schema, table, filter } } = clientPostgresBinding;
                const serverPostgresFilter = postgres_changes2 && postgres_changes2[i];
                if (serverPostgresFilter && serverPostgresFilter.event === event && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.schema, schema) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.table, table) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.filter, filter)) {
                  newPostgresBindings.push(Object.assign(Object.assign({}, clientPostgresBinding), { id: serverPostgresFilter.id }));
                } else {
                  this.unsubscribe();
                  this.state = constants_1.CHANNEL_STATES.errored;
                  callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES2.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
                  return;
                }
              }
              this.bindings.postgres_changes = newPostgresBindings;
              callback && callback(REALTIME_SUBSCRIBE_STATES2.SUBSCRIBED);
              return;
            }
          }).receive("error", (error) => {
            this.state = constants_1.CHANNEL_STATES.errored;
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES2.CHANNEL_ERROR, new Error(JSON.stringify(Object.values(error).join(", ") || "error")));
            return;
          }).receive("timeout", () => {
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES2.TIMED_OUT);
            return;
          });
        }
        return this;
      }
      /**
       * Returns the current presence state for this channel.
       *
       * The shape is a map keyed by presence key (for example a user id) where each entry contains the
       * tracked metadata for that user.
       */
      presenceState() {
        return this.presence.state;
      }
      /**
       * Sends the supplied payload to the presence tracker so other subscribers can see that this
       * client is online. Use `untrack` to stop broadcasting presence for the same key.
       */
      async track(payload, opts = {}) {
        return await this.send({
          type: "presence",
          event: "track",
          payload
        }, opts.timeout || this.timeout);
      }
      /**
       * Removes the current presence state for this client.
       */
      async untrack(opts = {}) {
        return await this.send({
          type: "presence",
          event: "untrack"
        }, opts);
      }
      on(type, filter, callback) {
        if (this.state === constants_1.CHANNEL_STATES.joined && type === REALTIME_LISTEN_TYPES2.PRESENCE) {
          this.socket.log("channel", `resubscribe to ${this.topic} due to change in presence callbacks on joined channel`);
          this.unsubscribe().then(async () => await this.subscribe());
        }
        return this._on(type, filter, callback);
      }
      /**
       * Sends a broadcast message explicitly via REST API.
       *
       * This method always uses the REST API endpoint regardless of WebSocket connection state.
       * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
       *
       * @param event The name of the broadcast event
       * @param payload Payload to be sent (required)
       * @param opts Options including timeout
       * @returns Promise resolving to object with success status, and error details if failed
       */
      async httpSend(event, payload, opts = {}) {
        var _a;
        if (payload === void 0 || payload === null) {
          return Promise.reject("Payload is required for httpSend()");
        }
        const headers = {
          apikey: this.socket.apiKey ? this.socket.apiKey : "",
          "Content-Type": "application/json"
        };
        if (this.socket.accessTokenValue) {
          headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
        }
        const options = {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: [
              {
                topic: this.subTopic,
                event,
                payload,
                private: this.private
              }
            ]
          })
        };
        const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
        if (response.status === 202) {
          return { success: true };
        }
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error || errorBody.message || errorMessage;
        } catch (_b) {
        }
        return Promise.reject(new Error(errorMessage));
      }
      /**
       * Sends a message into the channel.
       *
       * @param args Arguments to send to channel
       * @param args.type The type of event to send
       * @param args.event The name of the event being sent
       * @param args.payload Payload to be sent
       * @param opts Options to be used during the send process
       */
      async send(args, opts = {}) {
        var _a, _b;
        if (!this._canPush() && args.type === "broadcast") {
          console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
          const { event, payload: endpoint_payload } = args;
          const headers = {
            apikey: this.socket.apiKey ? this.socket.apiKey : "",
            "Content-Type": "application/json"
          };
          if (this.socket.accessTokenValue) {
            headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
          }
          const options = {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  topic: this.subTopic,
                  event,
                  payload: endpoint_payload,
                  private: this.private
                }
              ]
            })
          };
          try {
            const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
            await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
            return response.ok ? "ok" : "error";
          } catch (error) {
            if (error.name === "AbortError") {
              return "timed out";
            } else {
              return "error";
            }
          }
        } else {
          return new Promise((resolve) => {
            var _a2, _b2, _c;
            const push = this._push(args.type, args, opts.timeout || this.timeout);
            if (args.type === "broadcast" && !((_c = (_b2 = (_a2 = this.params) === null || _a2 === void 0 ? void 0 : _a2.config) === null || _b2 === void 0 ? void 0 : _b2.broadcast) === null || _c === void 0 ? void 0 : _c.ack)) {
              resolve("ok");
            }
            push.receive("ok", () => resolve("ok"));
            push.receive("error", () => resolve("error"));
            push.receive("timeout", () => resolve("timed out"));
          });
        }
      }
      /**
       * Updates the payload that will be sent the next time the channel joins (reconnects).
       * Useful for rotating access tokens or updating config without re-creating the channel.
       */
      updateJoinPayload(payload) {
        this.joinPush.updatePayload(payload);
      }
      /**
       * Leaves the channel.
       *
       * Unsubscribes from server events, and instructs channel to terminate on server.
       * Triggers onClose() hooks.
       *
       * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
       * channel.unsubscribe().receive("ok", () => alert("left!") )
       */
      unsubscribe(timeout = this.timeout) {
        this.state = constants_1.CHANNEL_STATES.leaving;
        const onClose = () => {
          this.socket.log("channel", `leave ${this.topic}`);
          this._trigger(constants_1.CHANNEL_EVENTS.close, "leave", this._joinRef());
        };
        this.joinPush.destroy();
        let leavePush = null;
        return new Promise((resolve) => {
          leavePush = new push_1.default(this, constants_1.CHANNEL_EVENTS.leave, {}, timeout);
          leavePush.receive("ok", () => {
            onClose();
            resolve("ok");
          }).receive("timeout", () => {
            onClose();
            resolve("timed out");
          }).receive("error", () => {
            resolve("error");
          });
          leavePush.send();
          if (!this._canPush()) {
            leavePush.trigger("ok", {});
          }
        }).finally(() => {
          leavePush === null || leavePush === void 0 ? void 0 : leavePush.destroy();
        });
      }
      /**
       * Teardown the channel.
       *
       * Destroys and stops related timers.
       */
      teardown() {
        this.pushBuffer.forEach((push) => push.destroy());
        this.pushBuffer = [];
        this.rejoinTimer.reset();
        this.joinPush.destroy();
        this.state = constants_1.CHANNEL_STATES.closed;
        this.bindings = {};
      }
      /** @internal */
      async _fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await this.socket.fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
        clearTimeout(id);
        return response;
      }
      /** @internal */
      _push(event, payload, timeout = this.timeout) {
        if (!this.joinedOnce) {
          throw `tried to push '${event}' to '${this.topic}' before joining. Use channel.subscribe() before pushing events`;
        }
        let pushEvent = new push_1.default(this, event, payload, timeout);
        if (this._canPush()) {
          pushEvent.send();
        } else {
          this._addToPushBuffer(pushEvent);
        }
        return pushEvent;
      }
      /** @internal */
      _addToPushBuffer(pushEvent) {
        pushEvent.startTimeout();
        this.pushBuffer.push(pushEvent);
        if (this.pushBuffer.length > constants_1.MAX_PUSH_BUFFER_SIZE) {
          const removedPush = this.pushBuffer.shift();
          if (removedPush) {
            removedPush.destroy();
            this.socket.log("channel", `discarded push due to buffer overflow: ${removedPush.event}`, removedPush.payload);
          }
        }
      }
      /**
       * Overridable message hook
       *
       * Receives all events for specialized message handling before dispatching to the channel callbacks.
       * Must return the payload, modified or unmodified.
       *
       * @internal
       */
      _onMessage(_event, payload, _ref) {
        return payload;
      }
      /** @internal */
      _isMember(topic) {
        return this.topic === topic;
      }
      /** @internal */
      _joinRef() {
        return this.joinPush.ref;
      }
      /** @internal */
      _trigger(type, payload, ref) {
        var _a, _b;
        const typeLower = type.toLocaleLowerCase();
        const { close, error, leave, join } = constants_1.CHANNEL_EVENTS;
        const events = [close, error, leave, join];
        if (ref && events.indexOf(typeLower) >= 0 && ref !== this._joinRef()) {
          return;
        }
        let handledPayload = this._onMessage(typeLower, payload, ref);
        if (payload && !handledPayload) {
          throw "channel onMessage callbacks must return the payload, modified or unmodified";
        }
        if (["insert", "update", "delete"].includes(typeLower)) {
          (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.filter((bind) => {
            var _a2, _b2, _c;
            return ((_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event) === "*" || ((_c = (_b2 = bind.filter) === null || _b2 === void 0 ? void 0 : _b2.event) === null || _c === void 0 ? void 0 : _c.toLocaleLowerCase()) === typeLower;
          }).map((bind) => bind.callback(handledPayload, ref));
        } else {
          (_b = this.bindings[typeLower]) === null || _b === void 0 ? void 0 : _b.filter((bind) => {
            var _a2, _b2, _c, _d, _e, _f, _g, _h;
            if (["broadcast", "presence", "postgres_changes"].includes(typeLower)) {
              if ("id" in bind) {
                const bindId = bind.id;
                const bindEvent = (_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event;
                return bindId && ((_b2 = payload.ids) === null || _b2 === void 0 ? void 0 : _b2.includes(bindId)) && (bindEvent === "*" || (bindEvent === null || bindEvent === void 0 ? void 0 : bindEvent.toLocaleLowerCase()) === ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.type.toLocaleLowerCase())) && (!((_d = bind.filter) === null || _d === void 0 ? void 0 : _d.table) || bind.filter.table === ((_e = payload.data) === null || _e === void 0 ? void 0 : _e.table));
              } else {
                const bindEvent = (_g = (_f = bind === null || bind === void 0 ? void 0 : bind.filter) === null || _f === void 0 ? void 0 : _f.event) === null || _g === void 0 ? void 0 : _g.toLocaleLowerCase();
                return bindEvent === "*" || bindEvent === ((_h = payload === null || payload === void 0 ? void 0 : payload.event) === null || _h === void 0 ? void 0 : _h.toLocaleLowerCase());
              }
            } else {
              return bind.type.toLocaleLowerCase() === typeLower;
            }
          }).map((bind) => {
            if (typeof handledPayload === "object" && "ids" in handledPayload) {
              const postgresChanges = handledPayload.data;
              const { schema, table, commit_timestamp, type: type2, errors } = postgresChanges;
              const enrichedPayload = {
                schema,
                table,
                commit_timestamp,
                eventType: type2,
                new: {},
                old: {},
                errors
              };
              handledPayload = Object.assign(Object.assign({}, enrichedPayload), this._getPayloadRecords(postgresChanges));
            }
            bind.callback(handledPayload, ref);
          });
        }
      }
      /** @internal */
      _isClosed() {
        return this.state === constants_1.CHANNEL_STATES.closed;
      }
      /** @internal */
      _isJoined() {
        return this.state === constants_1.CHANNEL_STATES.joined;
      }
      /** @internal */
      _isJoining() {
        return this.state === constants_1.CHANNEL_STATES.joining;
      }
      /** @internal */
      _isLeaving() {
        return this.state === constants_1.CHANNEL_STATES.leaving;
      }
      /** @internal */
      _replyEventName(ref) {
        return `chan_reply_${ref}`;
      }
      /** @internal */
      _on(type, filter, callback) {
        const typeLower = type.toLocaleLowerCase();
        const binding = {
          type: typeLower,
          filter,
          callback
        };
        if (this.bindings[typeLower]) {
          this.bindings[typeLower].push(binding);
        } else {
          this.bindings[typeLower] = [binding];
        }
        return this;
      }
      /** @internal */
      _off(type, filter) {
        const typeLower = type.toLocaleLowerCase();
        if (this.bindings[typeLower]) {
          this.bindings[typeLower] = this.bindings[typeLower].filter((bind) => {
            var _a;
            return !(((_a = bind.type) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase()) === typeLower && _RealtimeChannel.isEqual(bind.filter, filter));
          });
        }
        return this;
      }
      /** @internal */
      static isEqual(obj1, obj2) {
        if (Object.keys(obj1).length !== Object.keys(obj2).length) {
          return false;
        }
        for (const k in obj1) {
          if (obj1[k] !== obj2[k]) {
            return false;
          }
        }
        return true;
      }
      /**
       * Compares two optional filter values for equality.
       * Treats undefined, null, and empty string as equivalent empty values.
       * @internal
       */
      static isFilterValueEqual(serverValue, clientValue) {
        const normalizedServer = serverValue !== null && serverValue !== void 0 ? serverValue : void 0;
        const normalizedClient = clientValue !== null && clientValue !== void 0 ? clientValue : void 0;
        return normalizedServer === normalizedClient;
      }
      /** @internal */
      _rejoinUntilConnected() {
        this.rejoinTimer.scheduleTimeout();
        if (this.socket.isConnected()) {
          this._rejoin();
        }
      }
      /**
       * Registers a callback that will be executed when the channel closes.
       *
       * @internal
       */
      _onClose(callback) {
        this._on(constants_1.CHANNEL_EVENTS.close, {}, callback);
      }
      /**
       * Registers a callback that will be executed when the channel encounteres an error.
       *
       * @internal
       */
      _onError(callback) {
        this._on(constants_1.CHANNEL_EVENTS.error, {}, (reason) => callback(reason));
      }
      /**
       * Returns `true` if the socket is connected and the channel has been joined.
       *
       * @internal
       */
      _canPush() {
        return this.socket.isConnected() && this._isJoined();
      }
      /** @internal */
      _rejoin(timeout = this.timeout) {
        if (this._isLeaving()) {
          return;
        }
        this.socket._leaveOpenTopic(this.topic);
        this.state = constants_1.CHANNEL_STATES.joining;
        this.joinPush.resend(timeout);
      }
      /** @internal */
      _getPayloadRecords(payload) {
        const records = {
          new: {},
          old: {}
        };
        if (payload.type === "INSERT" || payload.type === "UPDATE") {
          records.new = Transformers.convertChangeData(payload.columns, payload.record);
        }
        if (payload.type === "UPDATE" || payload.type === "DELETE") {
          records.old = Transformers.convertChangeData(payload.columns, payload.old_record);
        }
        return records;
      }
    };
    exports.default = RealtimeChannel2;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js
var require_RealtimeClient = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var websocket_factory_1 = tslib_1.__importDefault(require_websocket_factory());
    var constants_1 = require_constants();
    var serializer_1 = tslib_1.__importDefault(require_serializer());
    var timer_1 = tslib_1.__importDefault(require_timer());
    var transformers_1 = require_transformers();
    var RealtimeChannel_1 = tslib_1.__importDefault(require_RealtimeChannel());
    var noop = () => {
    };
    var CONNECTION_TIMEOUTS = {
      HEARTBEAT_INTERVAL: 25e3,
      RECONNECT_DELAY: 10,
      HEARTBEAT_TIMEOUT_FALLBACK: 100
    };
    var RECONNECT_INTERVALS = [1e3, 2e3, 5e3, 1e4];
    var DEFAULT_RECONNECT_FALLBACK = 1e4;
    var WORKER_SCRIPT = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
    var RealtimeClient2 = class {
      /**
       * Initializes the Socket.
       *
       * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
       * @param httpEndpoint The string HTTP endpoint, ie, "https://example.com", "/" (inherited host & protocol)
       * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
       * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
       * @param options.params The optional params to pass when connecting.
       * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
       * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
       * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
       * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
       * @param options.logLevel Sets the log level for Realtime
       * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
       * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
       * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
       * @param options.worker Use Web Worker to set a side flow. Defaults to false.
       * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
       * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * client.connect()
       * ```
       */
      constructor(endPoint, options) {
        var _a;
        this.accessTokenValue = null;
        this.apiKey = null;
        this._manuallySetToken = false;
        this.channels = new Array();
        this.endPoint = "";
        this.httpEndpoint = "";
        this.headers = {};
        this.params = {};
        this.timeout = constants_1.DEFAULT_TIMEOUT;
        this.transport = null;
        this.heartbeatIntervalMs = CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.heartbeatTimer = void 0;
        this.pendingHeartbeatRef = null;
        this.heartbeatCallback = noop;
        this.ref = 0;
        this.reconnectTimer = null;
        this.vsn = constants_1.DEFAULT_VSN;
        this.logger = noop;
        this.conn = null;
        this.sendBuffer = [];
        this.serializer = new serializer_1.default();
        this.stateChangeCallbacks = {
          open: [],
          close: [],
          error: [],
          message: []
        };
        this.accessToken = null;
        this._connectionState = "disconnected";
        this._wasManualDisconnect = false;
        this._authPromise = null;
        this._heartbeatSentAt = null;
        this._resolveFetch = (customFetch) => {
          if (customFetch) {
            return (...args) => customFetch(...args);
          }
          return (...args) => fetch(...args);
        };
        if (!((_a = options === null || options === void 0 ? void 0 : options.params) === null || _a === void 0 ? void 0 : _a.apikey)) {
          throw new Error("API key is required to connect to Realtime");
        }
        this.apiKey = options.params.apikey;
        this.endPoint = `${endPoint}/${constants_1.TRANSPORTS.websocket}`;
        this.httpEndpoint = (0, transformers_1.httpEndpointURL)(endPoint);
        this._initializeOptions(options);
        this._setupReconnectionTimer();
        this.fetch = this._resolveFetch(options === null || options === void 0 ? void 0 : options.fetch);
      }
      /**
       * Connects the socket, unless already connected.
       */
      connect() {
        if (this.isConnecting() || this.isDisconnecting() || this.conn !== null && this.isConnected()) {
          return;
        }
        this._setConnectionState("connecting");
        if (this.accessToken && !this._authPromise) {
          this._setAuthSafely("connect");
        }
        if (this.transport) {
          this.conn = new this.transport(this.endpointURL());
        } else {
          try {
            this.conn = websocket_factory_1.default.createWebSocket(this.endpointURL());
          } catch (error) {
            this._setConnectionState("disconnected");
            const errorMessage = error.message;
            if (errorMessage.includes("Node.js")) {
              throw new Error(`${errorMessage}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`);
            }
            throw new Error(`WebSocket not available: ${errorMessage}`);
          }
        }
        this._setupConnectionHandlers();
      }
      /**
       * Returns the URL of the websocket.
       * @returns string The URL of the websocket.
       */
      endpointURL() {
        return this._appendParams(this.endPoint, Object.assign({}, this.params, { vsn: this.vsn }));
      }
      /**
       * Disconnects the socket.
       *
       * @param code A numeric status code to send on disconnect.
       * @param reason A custom reason for the disconnect.
       */
      disconnect(code, reason) {
        if (this.isDisconnecting()) {
          return;
        }
        this._setConnectionState("disconnecting", true);
        if (this.conn) {
          const fallbackTimer = setTimeout(() => {
            this._setConnectionState("disconnected");
          }, 100);
          this.conn.onclose = () => {
            clearTimeout(fallbackTimer);
            this._setConnectionState("disconnected");
          };
          if (typeof this.conn.close === "function") {
            if (code) {
              this.conn.close(code, reason !== null && reason !== void 0 ? reason : "");
            } else {
              this.conn.close();
            }
          }
          this._teardownConnection();
        } else {
          this._setConnectionState("disconnected");
        }
      }
      /**
       * Returns all created channels
       */
      getChannels() {
        return this.channels;
      }
      /**
       * Unsubscribes and removes a single channel
       * @param channel A RealtimeChannel instance
       */
      async removeChannel(channel) {
        const status = await channel.unsubscribe();
        if (this.channels.length === 0) {
          this.disconnect();
        }
        return status;
      }
      /**
       * Unsubscribes and removes all channels
       */
      async removeAllChannels() {
        const values_1 = await Promise.all(this.channels.map((channel) => channel.unsubscribe()));
        this.channels = [];
        this.disconnect();
        return values_1;
      }
      /**
       * Logs the message.
       *
       * For customized logging, `this.logger` can be overridden.
       */
      log(kind, msg, data) {
        this.logger(kind, msg, data);
      }
      /**
       * Returns the current state of the socket.
       */
      connectionState() {
        switch (this.conn && this.conn.readyState) {
          case constants_1.SOCKET_STATES.connecting:
            return constants_1.CONNECTION_STATE.Connecting;
          case constants_1.SOCKET_STATES.open:
            return constants_1.CONNECTION_STATE.Open;
          case constants_1.SOCKET_STATES.closing:
            return constants_1.CONNECTION_STATE.Closing;
          default:
            return constants_1.CONNECTION_STATE.Closed;
        }
      }
      /**
       * Returns `true` is the connection is open.
       */
      isConnected() {
        return this.connectionState() === constants_1.CONNECTION_STATE.Open;
      }
      /**
       * Returns `true` if the connection is currently connecting.
       */
      isConnecting() {
        return this._connectionState === "connecting";
      }
      /**
       * Returns `true` if the connection is currently disconnecting.
       */
      isDisconnecting() {
        return this._connectionState === "disconnecting";
      }
      /**
       * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
       *
       * Topics are automatically prefixed with `realtime:` to match the Realtime service.
       * If a channel with the same topic already exists it will be returned instead of creating
       * a duplicate connection.
       */
      channel(topic, params = { config: {} }) {
        const realtimeTopic = `realtime:${topic}`;
        const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
        if (!exists) {
          const chan = new RealtimeChannel_1.default(`realtime:${topic}`, params, this);
          this.channels.push(chan);
          return chan;
        } else {
          return exists;
        }
      }
      /**
       * Push out a message if the socket is connected.
       *
       * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
       */
      push(data) {
        const { topic, event, payload, ref } = data;
        const callback = () => {
          this.encode(data, (result) => {
            var _a;
            (_a = this.conn) === null || _a === void 0 ? void 0 : _a.send(result);
          });
        };
        this.log("push", `${topic} ${event} (${ref})`, payload);
        if (this.isConnected()) {
          callback();
        } else {
          this.sendBuffer.push(callback);
        }
      }
      /**
       * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
       *
       * If param is null it will use the `accessToken` callback function or the token set on the client.
       *
       * On callback used, it will set the value of the token internal to the client.
       *
       * When a token is explicitly provided, it will be preserved across channel operations
       * (including removeChannel and resubscribe). The `accessToken` callback will not be
       * invoked until `setAuth()` is called without arguments.
       *
       * @param token A JWT string to override the token set on the client.
       *
       * @example
       * // Use a manual token (preserved across resubscribes, ignores accessToken callback)
       * client.realtime.setAuth('my-custom-jwt')
       *
       * // Switch back to using the accessToken callback
       * client.realtime.setAuth()
       */
      async setAuth(token = null) {
        this._authPromise = this._performAuth(token);
        try {
          await this._authPromise;
        } finally {
          this._authPromise = null;
        }
      }
      /**
       * Returns true if the current access token was explicitly set via setAuth(token),
       * false if it was obtained via the accessToken callback.
       * @internal
       */
      _isManualToken() {
        return this._manuallySetToken;
      }
      /**
       * Sends a heartbeat message if the socket is connected.
       */
      async sendHeartbeat() {
        var _a;
        if (!this.isConnected()) {
          try {
            this.heartbeatCallback("disconnected");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          return;
        }
        if (this.pendingHeartbeatRef) {
          this.pendingHeartbeatRef = null;
          this._heartbeatSentAt = null;
          this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
          try {
            this.heartbeatCallback("timeout");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          this._wasManualDisconnect = false;
          (_a = this.conn) === null || _a === void 0 ? void 0 : _a.close(constants_1.WS_CLOSE_NORMAL, "heartbeat timeout");
          setTimeout(() => {
            var _a2;
            if (!this.isConnected()) {
              (_a2 = this.reconnectTimer) === null || _a2 === void 0 ? void 0 : _a2.scheduleTimeout();
            }
          }, CONNECTION_TIMEOUTS.HEARTBEAT_TIMEOUT_FALLBACK);
          return;
        }
        this._heartbeatSentAt = Date.now();
        this.pendingHeartbeatRef = this._makeRef();
        this.push({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: this.pendingHeartbeatRef
        });
        try {
          this.heartbeatCallback("sent");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
        this._setAuthSafely("heartbeat");
      }
      /**
       * Sets a callback that receives lifecycle events for internal heartbeat messages.
       * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
       */
      onHeartbeat(callback) {
        this.heartbeatCallback = callback;
      }
      /**
       * Flushes send buffer
       */
      flushSendBuffer() {
        if (this.isConnected() && this.sendBuffer.length > 0) {
          this.sendBuffer.forEach((callback) => callback());
          this.sendBuffer = [];
        }
      }
      /**
       * Return the next message ref, accounting for overflows
       *
       * @internal
       */
      _makeRef() {
        let newRef = this.ref + 1;
        if (newRef === this.ref) {
          this.ref = 0;
        } else {
          this.ref = newRef;
        }
        return this.ref.toString();
      }
      /**
       * Unsubscribe from channels with the specified topic.
       *
       * @internal
       */
      _leaveOpenTopic(topic) {
        let dupChannel = this.channels.find((c) => c.topic === topic && (c._isJoined() || c._isJoining()));
        if (dupChannel) {
          this.log("transport", `leaving duplicate topic "${topic}"`);
          dupChannel.unsubscribe();
        }
      }
      /**
       * Removes a subscription from the socket.
       *
       * @param channel An open subscription.
       *
       * @internal
       */
      _remove(channel) {
        this.channels = this.channels.filter((c) => c.topic !== channel.topic);
      }
      /** @internal */
      _onConnMessage(rawMessage) {
        this.decode(rawMessage.data, (msg) => {
          if (msg.topic === "phoenix" && msg.event === "phx_reply" && msg.ref && msg.ref === this.pendingHeartbeatRef) {
            const latency = this._heartbeatSentAt ? Date.now() - this._heartbeatSentAt : void 0;
            try {
              this.heartbeatCallback(msg.payload.status === "ok" ? "ok" : "error", latency);
            } catch (e) {
              this.log("error", "error in heartbeat callback", e);
            }
            this._heartbeatSentAt = null;
            this.pendingHeartbeatRef = null;
          }
          const { topic, event, payload, ref } = msg;
          const refString = ref ? `(${ref})` : "";
          const status = payload.status || "";
          this.log("receive", `${status} ${topic} ${event} ${refString}`.trim(), payload);
          this.channels.filter((channel) => channel._isMember(topic)).forEach((channel) => channel._trigger(event, payload, ref));
          this._triggerStateCallbacks("message", msg);
        });
      }
      /**
       * Clear specific timer
       * @internal
       */
      _clearTimer(timer) {
        var _a;
        if (timer === "heartbeat" && this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = void 0;
        } else if (timer === "reconnect") {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.reset();
        }
      }
      /**
       * Clear all timers
       * @internal
       */
      _clearAllTimers() {
        this._clearTimer("heartbeat");
        this._clearTimer("reconnect");
      }
      /**
       * Setup connection handlers for WebSocket events
       * @internal
       */
      _setupConnectionHandlers() {
        if (!this.conn)
          return;
        if ("binaryType" in this.conn) {
          ;
          this.conn.binaryType = "arraybuffer";
        }
        this.conn.onopen = () => this._onConnOpen();
        this.conn.onerror = (error) => this._onConnError(error);
        this.conn.onmessage = (event) => this._onConnMessage(event);
        this.conn.onclose = (event) => this._onConnClose(event);
        if (this.conn.readyState === constants_1.SOCKET_STATES.open) {
          this._onConnOpen();
        }
      }
      /**
       * Teardown connection and cleanup resources
       * @internal
       */
      _teardownConnection() {
        if (this.conn) {
          if (this.conn.readyState === constants_1.SOCKET_STATES.open || this.conn.readyState === constants_1.SOCKET_STATES.connecting) {
            try {
              this.conn.close();
            } catch (e) {
              this.log("error", "Error closing connection", e);
            }
          }
          this.conn.onopen = null;
          this.conn.onerror = null;
          this.conn.onmessage = null;
          this.conn.onclose = null;
          this.conn = null;
        }
        this._clearAllTimers();
        this._terminateWorker();
        this.channels.forEach((channel) => channel.teardown());
      }
      /** @internal */
      _onConnOpen() {
        this._setConnectionState("connected");
        this.log("transport", `connected to ${this.endpointURL()}`);
        const authPromise = this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve());
        authPromise.then(() => {
          this.flushSendBuffer();
        }).catch((e) => {
          this.log("error", "error waiting for auth on connect", e);
          this.flushSendBuffer();
        });
        this._clearTimer("reconnect");
        if (!this.worker) {
          this._startHeartbeat();
        } else {
          if (!this.workerRef) {
            this._startWorkerHeartbeat();
          }
        }
        this._triggerStateCallbacks("open");
      }
      /** @internal */
      _startHeartbeat() {
        this.heartbeatTimer && clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
      }
      /** @internal */
      _startWorkerHeartbeat() {
        if (this.workerUrl) {
          this.log("worker", `starting worker for from ${this.workerUrl}`);
        } else {
          this.log("worker", `starting default worker`);
        }
        const objectUrl = this._workerObjectUrl(this.workerUrl);
        this.workerRef = new Worker(objectUrl);
        this.workerRef.onerror = (error) => {
          this.log("worker", "worker error", error.message);
          this._terminateWorker();
        };
        this.workerRef.onmessage = (event) => {
          if (event.data.event === "keepAlive") {
            this.sendHeartbeat();
          }
        };
        this.workerRef.postMessage({
          event: "start",
          interval: this.heartbeatIntervalMs
        });
      }
      /**
       * Terminate the Web Worker and clear the reference
       * @internal
       */
      _terminateWorker() {
        if (this.workerRef) {
          this.log("worker", "terminating worker");
          this.workerRef.terminate();
          this.workerRef = void 0;
        }
      }
      /** @internal */
      _onConnClose(event) {
        var _a;
        this._setConnectionState("disconnected");
        this.log("transport", "close", event);
        this._triggerChanError();
        this._clearTimer("heartbeat");
        if (!this._wasManualDisconnect) {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.scheduleTimeout();
        }
        this._triggerStateCallbacks("close", event);
      }
      /** @internal */
      _onConnError(error) {
        this._setConnectionState("disconnected");
        this.log("transport", `${error}`);
        this._triggerChanError();
        this._triggerStateCallbacks("error", error);
      }
      /** @internal */
      _triggerChanError() {
        this.channels.forEach((channel) => channel._trigger(constants_1.CHANNEL_EVENTS.error));
      }
      /** @internal */
      _appendParams(url, params) {
        if (Object.keys(params).length === 0) {
          return url;
        }
        const prefix = url.match(/\?/) ? "&" : "?";
        const query = new URLSearchParams(params);
        return `${url}${prefix}${query}`;
      }
      _workerObjectUrl(url) {
        let result_url;
        if (url) {
          result_url = url;
        } else {
          const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
          result_url = URL.createObjectURL(blob);
        }
        return result_url;
      }
      /**
       * Set connection state with proper state management
       * @internal
       */
      _setConnectionState(state3, manual = false) {
        this._connectionState = state3;
        if (state3 === "connecting") {
          this._wasManualDisconnect = false;
        } else if (state3 === "disconnecting") {
          this._wasManualDisconnect = manual;
        }
      }
      /**
       * Perform the actual auth operation
       * @internal
       */
      async _performAuth(token = null) {
        let tokenToSend;
        let isManualToken = false;
        if (token) {
          tokenToSend = token;
          isManualToken = true;
        } else if (this.accessToken) {
          try {
            tokenToSend = await this.accessToken();
          } catch (e) {
            this.log("error", "Error fetching access token from callback", e);
            tokenToSend = this.accessTokenValue;
          }
        } else {
          tokenToSend = this.accessTokenValue;
        }
        if (isManualToken) {
          this._manuallySetToken = true;
        } else if (this.accessToken) {
          this._manuallySetToken = false;
        }
        if (this.accessTokenValue != tokenToSend) {
          this.accessTokenValue = tokenToSend;
          this.channels.forEach((channel) => {
            const payload = {
              access_token: tokenToSend,
              version: constants_1.DEFAULT_VERSION
            };
            tokenToSend && channel.updateJoinPayload(payload);
            if (channel.joinedOnce && channel._isJoined()) {
              channel._push(constants_1.CHANNEL_EVENTS.access_token, {
                access_token: tokenToSend
              });
            }
          });
        }
      }
      /**
       * Wait for any in-flight auth operations to complete
       * @internal
       */
      async _waitForAuthIfNeeded() {
        if (this._authPromise) {
          await this._authPromise;
        }
      }
      /**
       * Safely call setAuth with standardized error handling
       * @internal
       */
      _setAuthSafely(context = "general") {
        if (!this._isManualToken()) {
          this.setAuth().catch((e) => {
            this.log("error", `Error setting auth in ${context}`, e);
          });
        }
      }
      /**
       * Trigger state change callbacks with proper error handling
       * @internal
       */
      _triggerStateCallbacks(event, data) {
        try {
          this.stateChangeCallbacks[event].forEach((callback) => {
            try {
              callback(data);
            } catch (e) {
              this.log("error", `error in ${event} callback`, e);
            }
          });
        } catch (e) {
          this.log("error", `error triggering ${event} callbacks`, e);
        }
      }
      /**
       * Setup reconnection timer with proper configuration
       * @internal
       */
      _setupReconnectionTimer() {
        this.reconnectTimer = new timer_1.default(async () => {
          setTimeout(async () => {
            await this._waitForAuthIfNeeded();
            if (!this.isConnected()) {
              this.connect();
            }
          }, CONNECTION_TIMEOUTS.RECONNECT_DELAY);
        }, this.reconnectAfterMs);
      }
      /**
       * Initialize client options with defaults
       * @internal
       */
      _initializeOptions(options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        this.transport = (_a = options === null || options === void 0 ? void 0 : options.transport) !== null && _a !== void 0 ? _a : null;
        this.timeout = (_b = options === null || options === void 0 ? void 0 : options.timeout) !== null && _b !== void 0 ? _b : constants_1.DEFAULT_TIMEOUT;
        this.heartbeatIntervalMs = (_c = options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs) !== null && _c !== void 0 ? _c : CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.worker = (_d = options === null || options === void 0 ? void 0 : options.worker) !== null && _d !== void 0 ? _d : false;
        this.accessToken = (_e = options === null || options === void 0 ? void 0 : options.accessToken) !== null && _e !== void 0 ? _e : null;
        this.heartbeatCallback = (_f = options === null || options === void 0 ? void 0 : options.heartbeatCallback) !== null && _f !== void 0 ? _f : noop;
        this.vsn = (_g = options === null || options === void 0 ? void 0 : options.vsn) !== null && _g !== void 0 ? _g : constants_1.DEFAULT_VSN;
        if (options === null || options === void 0 ? void 0 : options.params)
          this.params = options.params;
        if (options === null || options === void 0 ? void 0 : options.logger)
          this.logger = options.logger;
        if ((options === null || options === void 0 ? void 0 : options.logLevel) || (options === null || options === void 0 ? void 0 : options.log_level)) {
          this.logLevel = options.logLevel || options.log_level;
          this.params = Object.assign(Object.assign({}, this.params), { log_level: this.logLevel });
        }
        this.reconnectAfterMs = (_h = options === null || options === void 0 ? void 0 : options.reconnectAfterMs) !== null && _h !== void 0 ? _h : ((tries) => {
          return RECONNECT_INTERVALS[tries - 1] || DEFAULT_RECONNECT_FALLBACK;
        });
        switch (this.vsn) {
          case constants_1.VSN_1_0_0:
            this.encode = (_j = options === null || options === void 0 ? void 0 : options.encode) !== null && _j !== void 0 ? _j : ((payload, callback) => {
              return callback(JSON.stringify(payload));
            });
            this.decode = (_k = options === null || options === void 0 ? void 0 : options.decode) !== null && _k !== void 0 ? _k : ((payload, callback) => {
              return callback(JSON.parse(payload));
            });
            break;
          case constants_1.VSN_2_0_0:
            this.encode = (_l = options === null || options === void 0 ? void 0 : options.encode) !== null && _l !== void 0 ? _l : this.serializer.encode.bind(this.serializer);
            this.decode = (_m = options === null || options === void 0 ? void 0 : options.decode) !== null && _m !== void 0 ? _m : this.serializer.decode.bind(this.serializer);
            break;
          default:
            throw new Error(`Unsupported serializer version: ${this.vsn}`);
        }
        if (this.worker) {
          if (typeof window !== "undefined" && !window.Worker) {
            throw new Error("Web Worker is not supported");
          }
          this.workerUrl = options === null || options === void 0 ? void 0 : options.workerUrl;
        }
      }
    };
    exports.default = RealtimeClient2;
  }
});

// ../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/index.js
var require_main2 = __commonJS({
  "../../node_modules/.pnpm/@supabase+realtime-js@2.91.1/node_modules/@supabase/realtime-js/dist/main/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebSocketFactory = exports.REALTIME_CHANNEL_STATES = exports.REALTIME_SUBSCRIBE_STATES = exports.REALTIME_PRESENCE_LISTEN_EVENTS = exports.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = exports.REALTIME_LISTEN_TYPES = exports.RealtimeClient = exports.RealtimeChannel = exports.RealtimePresence = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var RealtimeClient_1 = tslib_1.__importDefault(require_RealtimeClient());
    exports.RealtimeClient = RealtimeClient_1.default;
    var RealtimeChannel_1 = tslib_1.__importStar(require_RealtimeChannel());
    exports.RealtimeChannel = RealtimeChannel_1.default;
    Object.defineProperty(exports, "REALTIME_LISTEN_TYPES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_LISTEN_TYPES;
    } });
    Object.defineProperty(exports, "REALTIME_POSTGRES_CHANGES_LISTEN_EVENT", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
    } });
    Object.defineProperty(exports, "REALTIME_SUBSCRIBE_STATES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_SUBSCRIBE_STATES;
    } });
    Object.defineProperty(exports, "REALTIME_CHANNEL_STATES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_CHANNEL_STATES;
    } });
    var RealtimePresence_1 = tslib_1.__importStar(require_RealtimePresence());
    exports.RealtimePresence = RealtimePresence_1.default;
    Object.defineProperty(exports, "REALTIME_PRESENCE_LISTEN_EVENTS", { enumerable: true, get: function() {
      return RealtimePresence_1.REALTIME_PRESENCE_LISTEN_EVENTS;
    } });
    var websocket_factory_1 = tslib_1.__importDefault(require_websocket_factory());
    exports.WebSocketFactory = websocket_factory_1.default;
  }
});

// ../../node_modules/.pnpm/iceberg-js@0.8.1/node_modules/iceberg-js/dist/index.cjs
var require_dist2 = __commonJS({
  "../../node_modules/.pnpm/iceberg-js@0.8.1/node_modules/iceberg-js/dist/index.cjs"(exports) {
    "use strict";
    var IcebergError = class extends Error {
      constructor(message, opts) {
        super(message);
        this.name = "IcebergError";
        this.status = opts.status;
        this.icebergType = opts.icebergType;
        this.icebergCode = opts.icebergCode;
        this.details = opts.details;
        this.isCommitStateUnknown = opts.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(opts.status) && opts.icebergType?.includes("CommitState") === true;
      }
      /**
       * Returns true if the error is a 404 Not Found error.
       */
      isNotFound() {
        return this.status === 404;
      }
      /**
       * Returns true if the error is a 409 Conflict error.
       */
      isConflict() {
        return this.status === 409;
      }
      /**
       * Returns true if the error is a 419 Authentication Timeout error.
       */
      isAuthenticationTimeout() {
        return this.status === 419;
      }
    };
    function buildUrl(baseUrl, path, query) {
      const url = new URL(path, baseUrl);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== void 0) {
            url.searchParams.set(key, value);
          }
        }
      }
      return url.toString();
    }
    async function buildAuthHeaders(auth) {
      if (!auth || auth.type === "none") {
        return {};
      }
      if (auth.type === "bearer") {
        return { Authorization: `Bearer ${auth.token}` };
      }
      if (auth.type === "header") {
        return { [auth.name]: auth.value };
      }
      if (auth.type === "custom") {
        return await auth.getHeaders();
      }
      return {};
    }
    function createFetchClient(options) {
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      return {
        async request({
          method,
          path,
          query,
          body,
          headers
        }) {
          const url = buildUrl(options.baseUrl, path, query);
          const authHeaders = await buildAuthHeaders(options.auth);
          const res = await fetchFn(url, {
            method,
            headers: {
              ...body ? { "Content-Type": "application/json" } : {},
              ...authHeaders,
              ...headers
            },
            body: body ? JSON.stringify(body) : void 0
          });
          const text = await res.text();
          const isJson = (res.headers.get("content-type") || "").includes("application/json");
          const data = isJson && text ? JSON.parse(text) : text;
          if (!res.ok) {
            const errBody = isJson ? data : void 0;
            const errorDetail = errBody?.error;
            throw new IcebergError(
              errorDetail?.message ?? `Request failed with status ${res.status}`,
              {
                status: res.status,
                icebergType: errorDetail?.type,
                icebergCode: errorDetail?.code,
                details: errBody
              }
            );
          }
          return { status: res.status, headers: res.headers, data };
        }
      };
    }
    function namespaceToPath(namespace) {
      return namespace.join("");
    }
    var NamespaceOperations = class {
      constructor(client, prefix = "") {
        this.client = client;
        this.prefix = prefix;
      }
      async listNamespaces(parent) {
        const query = parent ? { parent: namespaceToPath(parent.namespace) } : void 0;
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces`,
          query
        });
        return response.data.namespaces.map((ns) => ({ namespace: ns }));
      }
      async createNamespace(id, metadata) {
        const request = {
          namespace: id.namespace,
          properties: metadata?.properties
        };
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces`,
          body: request
        });
        return response.data;
      }
      async dropNamespace(id) {
        await this.client.request({
          method: "DELETE",
          path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
        });
      }
      async loadNamespaceMetadata(id) {
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
        });
        return {
          properties: response.data.properties
        };
      }
      async namespaceExists(id) {
        try {
          await this.client.request({
            method: "HEAD",
            path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
          });
          return true;
        } catch (error) {
          if (error instanceof IcebergError && error.status === 404) {
            return false;
          }
          throw error;
        }
      }
      async createNamespaceIfNotExists(id, metadata) {
        try {
          return await this.createNamespace(id, metadata);
        } catch (error) {
          if (error instanceof IcebergError && error.status === 409) {
            return;
          }
          throw error;
        }
      }
    };
    function namespaceToPath2(namespace) {
      return namespace.join("");
    }
    var TableOperations = class {
      constructor(client, prefix = "", accessDelegation) {
        this.client = client;
        this.prefix = prefix;
        this.accessDelegation = accessDelegation;
      }
      async listTables(namespace) {
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`
        });
        return response.data.identifiers;
      }
      async createTable(namespace, request) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`,
          body: request,
          headers
        });
        return response.data.metadata;
      }
      async updateTable(id, request) {
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          body: request
        });
        return {
          "metadata-location": response.data["metadata-location"],
          metadata: response.data.metadata
        };
      }
      async dropTable(id, options) {
        await this.client.request({
          method: "DELETE",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          query: { purgeRequested: String(options?.purge ?? false) }
        });
      }
      async loadTable(id) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          headers
        });
        return response.data.metadata;
      }
      async tableExists(id) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        try {
          await this.client.request({
            method: "HEAD",
            path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
            headers
          });
          return true;
        } catch (error) {
          if (error instanceof IcebergError && error.status === 404) {
            return false;
          }
          throw error;
        }
      }
      async createTableIfNotExists(namespace, request) {
        try {
          return await this.createTable(namespace, request);
        } catch (error) {
          if (error instanceof IcebergError && error.status === 409) {
            return await this.loadTable({ namespace: namespace.namespace, name: request.name });
          }
          throw error;
        }
      }
    };
    var IcebergRestCatalog = class {
      /**
       * Creates a new Iceberg REST Catalog client.
       *
       * @param options - Configuration options for the catalog client
       */
      constructor(options) {
        let prefix = "v1";
        if (options.catalogName) {
          prefix += `/${options.catalogName}`;
        }
        const baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
        this.client = createFetchClient({
          baseUrl,
          auth: options.auth,
          fetchImpl: options.fetch
        });
        this.accessDelegation = options.accessDelegation?.join(",");
        this.namespaceOps = new NamespaceOperations(this.client, prefix);
        this.tableOps = new TableOperations(this.client, prefix, this.accessDelegation);
      }
      /**
       * Lists all namespaces in the catalog.
       *
       * @param parent - Optional parent namespace to list children under
       * @returns Array of namespace identifiers
       *
       * @example
       * ```typescript
       * // List all top-level namespaces
       * const namespaces = await catalog.listNamespaces();
       *
       * // List namespaces under a parent
       * const children = await catalog.listNamespaces({ namespace: ['analytics'] });
       * ```
       */
      async listNamespaces(parent) {
        return this.namespaceOps.listNamespaces(parent);
      }
      /**
       * Creates a new namespace in the catalog.
       *
       * @param id - Namespace identifier to create
       * @param metadata - Optional metadata properties for the namespace
       * @returns Response containing the created namespace and its properties
       *
       * @example
       * ```typescript
       * const response = await catalog.createNamespace(
       *   { namespace: ['analytics'] },
       *   { properties: { owner: 'data-team' } }
       * );
       * console.log(response.namespace); // ['analytics']
       * console.log(response.properties); // { owner: 'data-team', ... }
       * ```
       */
      async createNamespace(id, metadata) {
        return this.namespaceOps.createNamespace(id, metadata);
      }
      /**
       * Drops a namespace from the catalog.
       *
       * The namespace must be empty (contain no tables) before it can be dropped.
       *
       * @param id - Namespace identifier to drop
       *
       * @example
       * ```typescript
       * await catalog.dropNamespace({ namespace: ['analytics'] });
       * ```
       */
      async dropNamespace(id) {
        await this.namespaceOps.dropNamespace(id);
      }
      /**
       * Loads metadata for a namespace.
       *
       * @param id - Namespace identifier to load
       * @returns Namespace metadata including properties
       *
       * @example
       * ```typescript
       * const metadata = await catalog.loadNamespaceMetadata({ namespace: ['analytics'] });
       * console.log(metadata.properties);
       * ```
       */
      async loadNamespaceMetadata(id) {
        return this.namespaceOps.loadNamespaceMetadata(id);
      }
      /**
       * Lists all tables in a namespace.
       *
       * @param namespace - Namespace identifier to list tables from
       * @returns Array of table identifiers
       *
       * @example
       * ```typescript
       * const tables = await catalog.listTables({ namespace: ['analytics'] });
       * console.log(tables); // [{ namespace: ['analytics'], name: 'events' }, ...]
       * ```
       */
      async listTables(namespace) {
        return this.tableOps.listTables(namespace);
      }
      /**
       * Creates a new table in the catalog.
       *
       * @param namespace - Namespace to create the table in
       * @param request - Table creation request including name, schema, partition spec, etc.
       * @returns Table metadata for the created table
       *
       * @example
       * ```typescript
       * const metadata = await catalog.createTable(
       *   { namespace: ['analytics'] },
       *   {
       *     name: 'events',
       *     schema: {
       *       type: 'struct',
       *       fields: [
       *         { id: 1, name: 'id', type: 'long', required: true },
       *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
       *       ],
       *       'schema-id': 0
       *     },
       *     'partition-spec': {
       *       'spec-id': 0,
       *       fields: [
       *         { source_id: 2, field_id: 1000, name: 'ts_day', transform: 'day' }
       *       ]
       *     }
       *   }
       * );
       * ```
       */
      async createTable(namespace, request) {
        return this.tableOps.createTable(namespace, request);
      }
      /**
       * Updates an existing table's metadata.
       *
       * Can update the schema, partition spec, or properties of a table.
       *
       * @param id - Table identifier to update
       * @param request - Update request with fields to modify
       * @returns Response containing the metadata location and updated table metadata
       *
       * @example
       * ```typescript
       * const response = await catalog.updateTable(
       *   { namespace: ['analytics'], name: 'events' },
       *   {
       *     properties: { 'read.split.target-size': '134217728' }
       *   }
       * );
       * console.log(response['metadata-location']); // s3://...
       * console.log(response.metadata); // TableMetadata object
       * ```
       */
      async updateTable(id, request) {
        return this.tableOps.updateTable(id, request);
      }
      /**
       * Drops a table from the catalog.
       *
       * @param id - Table identifier to drop
       *
       * @example
       * ```typescript
       * await catalog.dropTable({ namespace: ['analytics'], name: 'events' });
       * ```
       */
      async dropTable(id, options) {
        await this.tableOps.dropTable(id, options);
      }
      /**
       * Loads metadata for a table.
       *
       * @param id - Table identifier to load
       * @returns Table metadata including schema, partition spec, location, etc.
       *
       * @example
       * ```typescript
       * const metadata = await catalog.loadTable({ namespace: ['analytics'], name: 'events' });
       * console.log(metadata.schema);
       * console.log(metadata.location);
       * ```
       */
      async loadTable(id) {
        return this.tableOps.loadTable(id);
      }
      /**
       * Checks if a namespace exists in the catalog.
       *
       * @param id - Namespace identifier to check
       * @returns True if the namespace exists, false otherwise
       *
       * @example
       * ```typescript
       * const exists = await catalog.namespaceExists({ namespace: ['analytics'] });
       * console.log(exists); // true or false
       * ```
       */
      async namespaceExists(id) {
        return this.namespaceOps.namespaceExists(id);
      }
      /**
       * Checks if a table exists in the catalog.
       *
       * @param id - Table identifier to check
       * @returns True if the table exists, false otherwise
       *
       * @example
       * ```typescript
       * const exists = await catalog.tableExists({ namespace: ['analytics'], name: 'events' });
       * console.log(exists); // true or false
       * ```
       */
      async tableExists(id) {
        return this.tableOps.tableExists(id);
      }
      /**
       * Creates a namespace if it does not exist.
       *
       * If the namespace already exists, returns void. If created, returns the response.
       *
       * @param id - Namespace identifier to create
       * @param metadata - Optional metadata properties for the namespace
       * @returns Response containing the created namespace and its properties, or void if it already exists
       *
       * @example
       * ```typescript
       * const response = await catalog.createNamespaceIfNotExists(
       *   { namespace: ['analytics'] },
       *   { properties: { owner: 'data-team' } }
       * );
       * if (response) {
       *   console.log('Created:', response.namespace);
       * } else {
       *   console.log('Already exists');
       * }
       * ```
       */
      async createNamespaceIfNotExists(id, metadata) {
        return this.namespaceOps.createNamespaceIfNotExists(id, metadata);
      }
      /**
       * Creates a table if it does not exist.
       *
       * If the table already exists, returns its metadata instead.
       *
       * @param namespace - Namespace to create the table in
       * @param request - Table creation request including name, schema, partition spec, etc.
       * @returns Table metadata for the created or existing table
       *
       * @example
       * ```typescript
       * const metadata = await catalog.createTableIfNotExists(
       *   { namespace: ['analytics'] },
       *   {
       *     name: 'events',
       *     schema: {
       *       type: 'struct',
       *       fields: [
       *         { id: 1, name: 'id', type: 'long', required: true },
       *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
       *       ],
       *       'schema-id': 0
       *     }
       *   }
       * );
       * ```
       */
      async createTableIfNotExists(namespace, request) {
        return this.tableOps.createTableIfNotExists(namespace, request);
      }
    };
    var DECIMAL_REGEX = /^decimal\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/;
    var FIXED_REGEX = /^fixed\s*\[\s*(\d+)\s*\]$/;
    function parseDecimalType(type) {
      const match = type.match(DECIMAL_REGEX);
      if (!match) return null;
      return {
        precision: parseInt(match[1], 10),
        scale: parseInt(match[2], 10)
      };
    }
    function parseFixedType(type) {
      const match = type.match(FIXED_REGEX);
      if (!match) return null;
      return {
        length: parseInt(match[1], 10)
      };
    }
    function isDecimalType(type) {
      return DECIMAL_REGEX.test(type);
    }
    function isFixedType(type) {
      return FIXED_REGEX.test(type);
    }
    function typesEqual(a, b) {
      const decimalA = parseDecimalType(a);
      const decimalB = parseDecimalType(b);
      if (decimalA && decimalB) {
        return decimalA.precision === decimalB.precision && decimalA.scale === decimalB.scale;
      }
      const fixedA = parseFixedType(a);
      const fixedB = parseFixedType(b);
      if (fixedA && fixedB) {
        return fixedA.length === fixedB.length;
      }
      return a === b;
    }
    function getCurrentSchema(metadata) {
      return metadata.schemas.find((s) => s["schema-id"] === metadata["current-schema-id"]);
    }
    exports.IcebergError = IcebergError;
    exports.IcebergRestCatalog = IcebergRestCatalog;
    exports.getCurrentSchema = getCurrentSchema;
    exports.isDecimalType = isDecimalType;
    exports.isFixedType = isFixedType;
    exports.parseDecimalType = parseDecimalType;
    exports.parseFixedType = parseFixedType;
    exports.typesEqual = typesEqual;
  }
});

// ../../node_modules/.pnpm/@supabase+storage-js@2.91.1/node_modules/@supabase/storage-js/dist/index.cjs
var require_dist3 = __commonJS({
  "../../node_modules/.pnpm/@supabase+storage-js@2.91.1/node_modules/@supabase/storage-js/dist/index.cjs"(exports) {
    var iceberg_js = require_dist2();
    var StorageError = class extends Error {
      constructor(message) {
        super(message);
        this.__isStorageError = true;
        this.name = "StorageError";
      }
    };
    function isStorageError(error) {
      return typeof error === "object" && error !== null && "__isStorageError" in error;
    }
    var StorageApiError = class extends StorageError {
      constructor(message, status, statusCode) {
        super(message);
        this.name = "StorageApiError";
        this.status = status;
        this.statusCode = statusCode;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          statusCode: this.statusCode
        };
      }
    };
    var StorageUnknownError = class extends StorageError {
      constructor(message, originalError) {
        super(message);
        this.name = "StorageUnknownError";
        this.originalError = originalError;
      }
    };
    var resolveFetch$1 = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    var resolveResponse$1 = () => {
      return Response;
    };
    var recursiveToCamel = (item) => {
      if (Array.isArray(item)) return item.map((el) => recursiveToCamel(el));
      else if (typeof item === "function" || item !== Object(item)) return item;
      const result = {};
      Object.entries(item).forEach(([key, value]) => {
        const newKey = key.replace(/([-_][a-z])/gi, (c) => c.toUpperCase().replace(/[-_]/g, ""));
        result[newKey] = recursiveToCamel(value);
      });
      return result;
    };
    var isPlainObject$1 = (value) => {
      if (typeof value !== "object" || value === null) return false;
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
    };
    var isValidBucketName = (bucketName) => {
      if (!bucketName || typeof bucketName !== "string") return false;
      if (bucketName.length === 0 || bucketName.length > 100) return false;
      if (bucketName.trim() !== bucketName) return false;
      if (bucketName.includes("/") || bucketName.includes("\\")) return false;
      return /^[\w!.\*'() &$@=;:+,?-]+$/.test(bucketName);
    };
    function _typeof(o) {
      "@babel/helpers - typeof";
      return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
        return typeof o$1;
      } : function(o$1) {
        return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
      }, _typeof(o);
    }
    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }
    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    function ownKeys2(e, r) {
      var t = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var o = Object.getOwnPropertySymbols(e);
        r && (o = o.filter(function(r$1) {
          return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
        })), t.push.apply(t, o);
      }
      return t;
    }
    function _objectSpread2(e) {
      for (var r = 1; r < arguments.length; r++) {
        var t = null != arguments[r] ? arguments[r] : {};
        r % 2 ? ownKeys2(Object(t), true).forEach(function(r$1) {
          _defineProperty(e, r$1, t[r$1]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r$1) {
          Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
        });
      }
      return e;
    }
    var _getErrorMessage$1 = (err) => {
      var _err$error;
      return err.msg || err.message || err.error_description || (typeof err.error === "string" ? err.error : (_err$error = err.error) === null || _err$error === void 0 ? void 0 : _err$error.message) || JSON.stringify(err);
    };
    var handleError$1 = async (error, reject, options) => {
      if (error instanceof await resolveResponse$1() && !(options === null || options === void 0 ? void 0 : options.noResolveJson)) error.json().then((err) => {
        const status = error.status || 500;
        const statusCode = (err === null || err === void 0 ? void 0 : err.statusCode) || status + "";
        reject(new StorageApiError(_getErrorMessage$1(err), status, statusCode));
      }).catch((err) => {
        reject(new StorageUnknownError(_getErrorMessage$1(err), err));
      });
      else reject(new StorageUnknownError(_getErrorMessage$1(error), error));
    };
    var _getRequestParams$1 = (method, options, parameters, body) => {
      const params = {
        method,
        headers: (options === null || options === void 0 ? void 0 : options.headers) || {}
      };
      if (method === "GET" || !body) return params;
      if (isPlainObject$1(body)) {
        params.headers = _objectSpread2({ "Content-Type": "application/json" }, options === null || options === void 0 ? void 0 : options.headers);
        params.body = JSON.stringify(body);
      } else params.body = body;
      if (options === null || options === void 0 ? void 0 : options.duplex) params.duplex = options.duplex;
      return _objectSpread2(_objectSpread2({}, params), parameters);
    };
    async function _handleRequest$1(fetcher, method, url, options, parameters, body) {
      return new Promise((resolve, reject) => {
        fetcher(url, _getRequestParams$1(method, options, parameters, body)).then((result) => {
          if (!result.ok) throw result;
          if (options === null || options === void 0 ? void 0 : options.noResolveJson) return result;
          return result.json();
        }).then((data) => resolve(data)).catch((error) => handleError$1(error, reject, options));
      });
    }
    async function get(fetcher, url, options, parameters) {
      return _handleRequest$1(fetcher, "GET", url, options, parameters);
    }
    async function post$1(fetcher, url, body, options, parameters) {
      return _handleRequest$1(fetcher, "POST", url, options, parameters, body);
    }
    async function put(fetcher, url, body, options, parameters) {
      return _handleRequest$1(fetcher, "PUT", url, options, parameters, body);
    }
    async function head(fetcher, url, options, parameters) {
      return _handleRequest$1(fetcher, "HEAD", url, _objectSpread2(_objectSpread2({}, options), {}, { noResolveJson: true }), parameters);
    }
    async function remove(fetcher, url, body, options, parameters) {
      return _handleRequest$1(fetcher, "DELETE", url, options, parameters, body);
    }
    var StreamDownloadBuilder = class {
      constructor(downloadFn, shouldThrowOnError) {
        this.downloadFn = downloadFn;
        this.shouldThrowOnError = shouldThrowOnError;
      }
      then(onfulfilled, onrejected) {
        return this.execute().then(onfulfilled, onrejected);
      }
      async execute() {
        var _this = this;
        try {
          return {
            data: (await _this.downloadFn()).body,
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var _Symbol$toStringTag;
    _Symbol$toStringTag = Symbol.toStringTag;
    var BlobDownloadBuilder = class {
      constructor(downloadFn, shouldThrowOnError) {
        this.downloadFn = downloadFn;
        this.shouldThrowOnError = shouldThrowOnError;
        this[_Symbol$toStringTag] = "BlobDownloadBuilder";
        this.promise = null;
      }
      asStream() {
        return new StreamDownloadBuilder(this.downloadFn, this.shouldThrowOnError);
      }
      then(onfulfilled, onrejected) {
        return this.getPromise().then(onfulfilled, onrejected);
      }
      catch(onrejected) {
        return this.getPromise().catch(onrejected);
      }
      finally(onfinally) {
        return this.getPromise().finally(onfinally);
      }
      getPromise() {
        if (!this.promise) this.promise = this.execute();
        return this.promise;
      }
      async execute() {
        var _this = this;
        try {
          return {
            data: await (await _this.downloadFn()).blob(),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var DEFAULT_SEARCH_OPTIONS = {
      limit: 100,
      offset: 0,
      sortBy: {
        column: "name",
        order: "asc"
      }
    };
    var DEFAULT_FILE_OPTIONS = {
      cacheControl: "3600",
      contentType: "text/plain;charset=UTF-8",
      upsert: false
    };
    var StorageFileApi = class {
      constructor(url, headers = {}, bucketId, fetch$1) {
        this.shouldThrowOnError = false;
        this.url = url;
        this.headers = headers;
        this.bucketId = bucketId;
        this.fetch = resolveFetch$1(fetch$1);
      }
      /**
      * Enable throwing errors instead of returning them.
      *
      * @category File Buckets
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
      *
      * @param method HTTP method.
      * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param fileBody The body of the file to be stored in the bucket.
      */
      async uploadOrUpdate(method, path, fileBody, fileOptions) {
        var _this = this;
        try {
          let body;
          const options = _objectSpread2(_objectSpread2({}, DEFAULT_FILE_OPTIONS), fileOptions);
          let headers = _objectSpread2(_objectSpread2({}, _this.headers), method === "POST" && { "x-upsert": String(options.upsert) });
          const metadata = options.metadata;
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            if (metadata) body.append("metadata", _this.encodeMetadata(metadata));
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            if (!body.has("cacheControl")) body.append("cacheControl", options.cacheControl);
            if (metadata && !body.has("metadata")) body.append("metadata", _this.encodeMetadata(metadata));
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
            if (metadata) headers["x-metadata"] = _this.toBase64(_this.encodeMetadata(metadata));
            if ((typeof ReadableStream !== "undefined" && body instanceof ReadableStream || body && typeof body === "object" && "pipe" in body && typeof body.pipe === "function") && !options.duplex) options.duplex = "half";
          }
          if (fileOptions === null || fileOptions === void 0 ? void 0 : fileOptions.headers) headers = _objectSpread2(_objectSpread2({}, headers), fileOptions.headers);
          const cleanPath = _this._removeEmptyFolders(path);
          const _path = _this._getFinalPath(cleanPath);
          const data = await (method == "PUT" ? put : post$1)(_this.fetch, `${_this.url}/object/${_path}`, body, _objectSpread2({ headers }, (options === null || options === void 0 ? void 0 : options.duplex) ? { duplex: options.duplex } : {}));
          return {
            data: {
              path: cleanPath,
              id: data.Id,
              fullPath: data.Key
            },
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Uploads a file to an existing bucket.
      *
      * @category File Buckets
      * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
      * @returns Promise with response containing file path, id, and fullPath or error
      *
      * @example Upload file
      * ```js
      * const avatarFile = event.target.files[0]
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .upload('public/avatar1.png', avatarFile, {
      *     cacheControl: '3600',
      *     upsert: false
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "public/avatar1.png",
      *     "fullPath": "avatars/public/avatar1.png"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Upload file using `ArrayBuffer` from base64 file data
      * ```js
      * import { decode } from 'base64-arraybuffer'
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .upload('public/avatar1.png', decode('base64FileData'), {
      *     contentType: 'image/png'
      *   })
      * ```
      */
      async upload(path, fileBody, fileOptions) {
        return this.uploadOrUpdate("POST", path, fileBody, fileOptions);
      }
      /**
      * Upload a file with a token generated from `createSignedUploadUrl`.
      *
      * @category File Buckets
      * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param token The token generated from `createSignedUploadUrl`
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions HTTP headers (cacheControl, contentType, etc.).
      * **Note:** The `upsert` option has no effect here. To enable upsert behavior,
      * pass `{ upsert: true }` when calling `createSignedUploadUrl()` instead.
      * @returns Promise with response containing file path and fullPath or error
      *
      * @example Upload to a signed URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .uploadToSignedUrl('folder/cat.jpg', 'token-from-createSignedUploadUrl', file)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "folder/cat.jpg",
      *     "fullPath": "avatars/folder/cat.jpg"
      *   },
      *   "error": null
      * }
      * ```
      */
      async uploadToSignedUrl(path, token, fileBody, fileOptions) {
        var _this3 = this;
        const cleanPath = _this3._removeEmptyFolders(path);
        const _path = _this3._getFinalPath(cleanPath);
        const url = new URL(_this3.url + `/object/upload/sign/${_path}`);
        url.searchParams.set("token", token);
        try {
          let body;
          const options = _objectSpread2({ upsert: DEFAULT_FILE_OPTIONS.upsert }, fileOptions);
          const headers = _objectSpread2(_objectSpread2({}, _this3.headers), { "x-upsert": String(options.upsert) });
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            body.append("cacheControl", options.cacheControl);
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
          }
          return {
            data: {
              path: cleanPath,
              fullPath: (await put(_this3.fetch, url.toString(), body, { headers })).Key
            },
            error: null
          };
        } catch (error) {
          if (_this3.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Creates a signed upload URL.
      * Signed upload URLs can be used to upload files to the bucket without further authentication.
      * They are valid for 2 hours.
      *
      * @category File Buckets
      * @param path The file path, including the current file name. For example `folder/image.png`.
      * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
      * @returns Promise with response containing signed upload URL, token, and path or error
      *
      * @example Create Signed Upload URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUploadUrl('folder/cat.jpg')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "signedUrl": "https://example.supabase.co/storage/v1/object/upload/sign/avatars/folder/cat.jpg?token=<TOKEN>",
      *     "path": "folder/cat.jpg",
      *     "token": "<TOKEN>"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createSignedUploadUrl(path, options) {
        var _this4 = this;
        try {
          let _path = _this4._getFinalPath(path);
          const headers = _objectSpread2({}, _this4.headers);
          if (options === null || options === void 0 ? void 0 : options.upsert) headers["x-upsert"] = "true";
          const data = await post$1(_this4.fetch, `${_this4.url}/object/upload/sign/${_path}`, {}, { headers });
          const url = new URL(_this4.url + data.url);
          const token = url.searchParams.get("token");
          if (!token) throw new StorageError("No token returned by API");
          return {
            data: {
              signedUrl: url.toString(),
              path,
              token
            },
            error: null
          };
        } catch (error) {
          if (_this4.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Replaces an existing file at the specified path with a new one.
      *
      * @category File Buckets
      * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
      * @returns Promise with response containing file path, id, and fullPath or error
      *
      * @example Update file
      * ```js
      * const avatarFile = event.target.files[0]
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .update('public/avatar1.png', avatarFile, {
      *     cacheControl: '3600',
      *     upsert: true
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "public/avatar1.png",
      *     "fullPath": "avatars/public/avatar1.png"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Update file using `ArrayBuffer` from base64 file data
      * ```js
      * import {decode} from 'base64-arraybuffer'
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .update('public/avatar1.png', decode('base64FileData'), {
      *     contentType: 'image/png'
      *   })
      * ```
      */
      async update(path, fileBody, fileOptions) {
        return this.uploadOrUpdate("PUT", path, fileBody, fileOptions);
      }
      /**
      * Moves an existing file to a new path in the same bucket.
      *
      * @category File Buckets
      * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
      * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
      * @param options The destination options.
      * @returns Promise with response containing success message or error
      *
      * @example Move file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .move('public/avatar1.png', 'private/avatar2.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully moved"
      *   },
      *   "error": null
      * }
      * ```
      */
      async move(fromPath, toPath, options) {
        var _this6 = this;
        try {
          return {
            data: await post$1(_this6.fetch, `${_this6.url}/object/move`, {
              bucketId: _this6.bucketId,
              sourceKey: fromPath,
              destinationKey: toPath,
              destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
            }, { headers: _this6.headers }),
            error: null
          };
        } catch (error) {
          if (_this6.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Copies an existing file to a new path in the same bucket.
      *
      * @category File Buckets
      * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
      * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
      * @param options The destination options.
      * @returns Promise with response containing copied file path or error
      *
      * @example Copy file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .copy('public/avatar1.png', 'private/avatar2.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "avatars/private/avatar2.png"
      *   },
      *   "error": null
      * }
      * ```
      */
      async copy(fromPath, toPath, options) {
        var _this7 = this;
        try {
          return {
            data: { path: (await post$1(_this7.fetch, `${_this7.url}/object/copy`, {
              bucketId: _this7.bucketId,
              sourceKey: fromPath,
              destinationKey: toPath,
              destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
            }, { headers: _this7.headers })).Key },
            error: null
          };
        } catch (error) {
          if (_this7.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
      *
      * @category File Buckets
      * @param path The file path, including the current file name. For example `folder/image.png`.
      * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
      * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns Promise with response containing signed URL or error
      *
      * @example Create Signed URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Create a signed URL for an asset with transformations
      * ```js
      * const { data } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60, {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *     }
      *   })
      * ```
      *
      * @example Create a signed URL which triggers the download of the asset
      * ```js
      * const { data } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60, {
      *     download: true,
      *   })
      * ```
      */
      async createSignedUrl(path, expiresIn, options) {
        var _this8 = this;
        try {
          let _path = _this8._getFinalPath(path);
          let data = await post$1(_this8.fetch, `${_this8.url}/object/sign/${_path}`, _objectSpread2({ expiresIn }, (options === null || options === void 0 ? void 0 : options.transform) ? { transform: options.transform } : {}), { headers: _this8.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          data = { signedUrl: encodeURI(`${_this8.url}${data.signedURL}${downloadQueryParam}`) };
          return {
            data,
            error: null
          };
        } catch (error) {
          if (_this8.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
      *
      * @category File Buckets
      * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
      * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
      * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @returns Promise with response containing array of objects with signedUrl, path, and error or error
      *
      * @example Create Signed URLs
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrls(['folder/avatar1.png', 'folder/avatar2.png'], 60)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "error": null,
      *       "path": "folder/avatar1.png",
      *       "signedURL": "/object/sign/avatars/folder/avatar1.png?token=<TOKEN>",
      *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
      *     },
      *     {
      *       "error": null,
      *       "path": "folder/avatar2.png",
      *       "signedURL": "/object/sign/avatars/folder/avatar2.png?token=<TOKEN>",
      *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar2.png?token=<TOKEN>"
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      */
      async createSignedUrls(paths, expiresIn, options) {
        var _this9 = this;
        try {
          const data = await post$1(_this9.fetch, `${_this9.url}/object/sign/${_this9.bucketId}`, {
            expiresIn,
            paths
          }, { headers: _this9.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          return {
            data: data.map((datum) => _objectSpread2(_objectSpread2({}, datum), {}, { signedUrl: datum.signedURL ? encodeURI(`${_this9.url}${datum.signedURL}${downloadQueryParam}`) : null })),
            error: null
          };
        } catch (error) {
          if (_this9.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
      *
      * @category File Buckets
      * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns BlobDownloadBuilder instance for downloading the file
      *
      * @example Download file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": <BLOB>,
      *   "error": null
      * }
      * ```
      *
      * @example Download file with transformations
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *       quality: 80
      *     }
      *   })
      * ```
      */
      download(path, options) {
        const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image/authenticated" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        const queryString = transformationQuery ? `?${transformationQuery}` : "";
        const _path = this._getFinalPath(path);
        const downloadFn = () => get(this.fetch, `${this.url}/${renderPath}/${_path}${queryString}`, {
          headers: this.headers,
          noResolveJson: true
        });
        return new BlobDownloadBuilder(downloadFn, this.shouldThrowOnError);
      }
      /**
      * Retrieves the details of an existing file.
      *
      * @category File Buckets
      * @param path The file path, including the file name. For example `folder/image.png`.
      * @returns Promise with response containing file metadata or error
      *
      * @example Get file info
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .info('folder/avatar1.png')
      * ```
      */
      async info(path) {
        var _this10 = this;
        const _path = _this10._getFinalPath(path);
        try {
          return {
            data: recursiveToCamel(await get(_this10.fetch, `${_this10.url}/object/info/${_path}`, { headers: _this10.headers })),
            error: null
          };
        } catch (error) {
          if (_this10.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Checks the existence of a file.
      *
      * @category File Buckets
      * @param path The file path, including the file name. For example `folder/image.png`.
      * @returns Promise with response containing boolean indicating file existence or error
      *
      * @example Check file existence
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .exists('folder/avatar1.png')
      * ```
      */
      async exists(path) {
        var _this11 = this;
        const _path = _this11._getFinalPath(path);
        try {
          await head(_this11.fetch, `${_this11.url}/object/${_path}`, { headers: _this11.headers });
          return {
            data: true,
            error: null
          };
        } catch (error) {
          if (_this11.shouldThrowOnError) throw error;
          if (isStorageError(error) && error instanceof StorageUnknownError) {
            const originalError = error.originalError;
            if ([400, 404].includes(originalError === null || originalError === void 0 ? void 0 : originalError.status)) return {
              data: false,
              error
            };
          }
          throw error;
        }
      }
      /**
      * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
      * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
      *
      * @category File Buckets
      * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
      * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns Object with public URL
      *
      * @example Returns the URL for an asset in a public bucket
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "publicUrl": "https://example.supabase.co/storage/v1/object/public/public-bucket/folder/avatar1.png"
      *   }
      * }
      * ```
      *
      * @example Returns the URL for an asset in a public bucket with transformations
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png', {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *     }
      *   })
      * ```
      *
      * @example Returns the URL which triggers the download of an asset in a public bucket
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png', {
      *     download: true,
      *   })
      * ```
      */
      getPublicUrl(path, options) {
        const _path = this._getFinalPath(path);
        const _queryString = [];
        const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `download=${options.download === true ? "" : options.download}` : "";
        if (downloadQueryParam !== "") _queryString.push(downloadQueryParam);
        const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        if (transformationQuery !== "") _queryString.push(transformationQuery);
        let queryString = _queryString.join("&");
        if (queryString !== "") queryString = `?${queryString}`;
        return { data: { publicUrl: encodeURI(`${this.url}/${renderPath}/public/${_path}${queryString}`) } };
      }
      /**
      * Deletes files within the same bucket
      *
      * @category File Buckets
      * @param paths An array of files to delete, including the path and file name. For example [`'folder/image.png'`].
      * @returns Promise with response containing array of deleted file objects or error
      *
      * @example Delete file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .remove(['folder/avatar1.png'])
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [],
      *   "error": null
      * }
      * ```
      */
      async remove(paths) {
        var _this12 = this;
        try {
          return {
            data: await remove(_this12.fetch, `${_this12.url}/object/${_this12.bucketId}`, { prefixes: paths }, { headers: _this12.headers }),
            error: null
          };
        } catch (error) {
          if (_this12.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Get file metadata
      * @param id the file id to retrieve metadata
      */
      /**
      * Update file metadata
      * @param id the file id to update metadata
      * @param meta the new file metadata
      */
      /**
      * Lists all the files and folders within a path of the bucket.
      *
      * @category File Buckets
      * @param path The folder path.
      * @param options Search options including limit (defaults to 100), offset, sortBy, and search
      * @param parameters Optional fetch parameters including signal for cancellation
      * @returns Promise with response containing array of files or error
      *
      * @example List files in a bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .list('folder', {
      *     limit: 100,
      *     offset: 0,
      *     sortBy: { column: 'name', order: 'asc' },
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "avatar1.png",
      *       "id": "e668cf7f-821b-4a2f-9dce-7dfa5dd1cfd2",
      *       "updated_at": "2024-05-22T23:06:05.580Z",
      *       "created_at": "2024-05-22T23:04:34.443Z",
      *       "last_accessed_at": "2024-05-22T23:04:34.443Z",
      *       "metadata": {
      *         "eTag": "\"c5e8c553235d9af30ef4f6e280790b92\"",
      *         "size": 32175,
      *         "mimetype": "image/png",
      *         "cacheControl": "max-age=3600",
      *         "lastModified": "2024-05-22T23:06:05.574Z",
      *         "contentLength": 32175,
      *         "httpStatusCode": 200
      *       }
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      *
      * @example Search files in a bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .list('folder', {
      *     limit: 100,
      *     offset: 0,
      *     sortBy: { column: 'name', order: 'asc' },
      *     search: 'jon'
      *   })
      * ```
      */
      async list(path, options, parameters) {
        var _this13 = this;
        try {
          const body = _objectSpread2(_objectSpread2(_objectSpread2({}, DEFAULT_SEARCH_OPTIONS), options), {}, { prefix: path || "" });
          return {
            data: await post$1(_this13.fetch, `${_this13.url}/object/list/${_this13.bucketId}`, body, { headers: _this13.headers }, parameters),
            error: null
          };
        } catch (error) {
          if (_this13.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * @experimental this method signature might change in the future
      *
      * @category File Buckets
      * @param options search options
      * @param parameters
      */
      async listV2(options, parameters) {
        var _this14 = this;
        try {
          const body = _objectSpread2({}, options);
          return {
            data: await post$1(_this14.fetch, `${_this14.url}/object/list-v2/${_this14.bucketId}`, body, { headers: _this14.headers }, parameters),
            error: null
          };
        } catch (error) {
          if (_this14.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      encodeMetadata(metadata) {
        return JSON.stringify(metadata);
      }
      toBase64(data) {
        if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
        return btoa(data);
      }
      _getFinalPath(path) {
        return `${this.bucketId}/${path.replace(/^\/+/, "")}`;
      }
      _removeEmptyFolders(path) {
        return path.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
      }
      transformOptsToQueryString(transform) {
        const params = [];
        if (transform.width) params.push(`width=${transform.width}`);
        if (transform.height) params.push(`height=${transform.height}`);
        if (transform.resize) params.push(`resize=${transform.resize}`);
        if (transform.format) params.push(`format=${transform.format}`);
        if (transform.quality) params.push(`quality=${transform.quality}`);
        return params.join("&");
      }
    };
    var version = "2.91.1";
    var DEFAULT_HEADERS$1 = { "X-Client-Info": `storage-js/${version}` };
    var StorageBucketApi = class {
      constructor(url, headers = {}, fetch$1, opts) {
        this.shouldThrowOnError = false;
        const baseUrl = new URL(url);
        if (opts === null || opts === void 0 ? void 0 : opts.useNewHostname) {
          if (/supabase\.(co|in|red)$/.test(baseUrl.hostname) && !baseUrl.hostname.includes("storage.supabase.")) baseUrl.hostname = baseUrl.hostname.replace("supabase.", "storage.supabase.");
        }
        this.url = baseUrl.href.replace(/\/$/, "");
        this.headers = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS$1), headers);
        this.fetch = resolveFetch$1(fetch$1);
      }
      /**
      * Enable throwing errors instead of returning them.
      *
      * @category File Buckets
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Retrieves the details of all Storage buckets within an existing project.
      *
      * @category File Buckets
      * @param options Query parameters for listing buckets
      * @param options.limit Maximum number of buckets to return
      * @param options.offset Number of buckets to skip
      * @param options.sortColumn Column to sort by ('id', 'name', 'created_at', 'updated_at')
      * @param options.sortOrder Sort order ('asc' or 'desc')
      * @param options.search Search term to filter bucket names
      * @returns Promise with response containing array of buckets or error
      *
      * @example List buckets
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .listBuckets()
      * ```
      *
      * @example List buckets with options
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .listBuckets({
      *     limit: 10,
      *     offset: 0,
      *     sortColumn: 'created_at',
      *     sortOrder: 'desc',
      *     search: 'prod'
      *   })
      * ```
      */
      async listBuckets(options) {
        var _this = this;
        try {
          const queryString = _this.listBucketOptionsToQueryString(options);
          return {
            data: await get(_this.fetch, `${_this.url}/bucket${queryString}`, { headers: _this.headers }),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Retrieves the details of an existing Storage bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to retrieve.
      * @returns Promise with response containing bucket details or error
      *
      * @example Get bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .getBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "id": "avatars",
      *     "name": "avatars",
      *     "owner": "",
      *     "public": false,
      *     "file_size_limit": 1024,
      *     "allowed_mime_types": [
      *       "image/png"
      *     ],
      *     "created_at": "2024-05-22T22:26:05.100Z",
      *     "updated_at": "2024-05-22T22:26:05.100Z"
      *   },
      *   "error": null
      * }
      * ```
      */
      async getBucket(id) {
        var _this2 = this;
        try {
          return {
            data: await get(_this2.fetch, `${_this2.url}/bucket/${id}`, { headers: _this2.headers }),
            error: null
          };
        } catch (error) {
          if (_this2.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Creates a new Storage bucket
      *
      * @category File Buckets
      * @param id A unique identifier for the bucket you are creating.
      * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
      * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
      * The global file size limit takes precedence over this value.
      * The default value is null, which doesn't set a per bucket file size limit.
      * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
      * The default value is null, which allows files with all mime types to be uploaded.
      * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
      * @param options.type (private-beta) specifies the bucket type. see `BucketType` for more details.
      *   - default bucket type is `STANDARD`
      * @returns Promise with response containing newly created bucket name or error
      *
      * @example Create bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .createBucket('avatars', {
      *     public: false,
      *     allowedMimeTypes: ['image/png'],
      *     fileSizeLimit: 1024
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "name": "avatars"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createBucket(id, options = { public: false }) {
        var _this3 = this;
        try {
          return {
            data: await post$1(_this3.fetch, `${_this3.url}/bucket`, {
              id,
              name: id,
              type: options.type,
              public: options.public,
              file_size_limit: options.fileSizeLimit,
              allowed_mime_types: options.allowedMimeTypes
            }, { headers: _this3.headers }),
            error: null
          };
        } catch (error) {
          if (_this3.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Updates a Storage bucket
      *
      * @category File Buckets
      * @param id A unique identifier for the bucket you are updating.
      * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
      * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
      * The global file size limit takes precedence over this value.
      * The default value is null, which doesn't set a per bucket file size limit.
      * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
      * The default value is null, which allows files with all mime types to be uploaded.
      * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
      * @returns Promise with response containing success message or error
      *
      * @example Update bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .updateBucket('avatars', {
      *     public: false,
      *     allowedMimeTypes: ['image/png'],
      *     fileSizeLimit: 1024
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully updated"
      *   },
      *   "error": null
      * }
      * ```
      */
      async updateBucket(id, options) {
        var _this4 = this;
        try {
          return {
            data: await put(_this4.fetch, `${_this4.url}/bucket/${id}`, {
              id,
              name: id,
              public: options.public,
              file_size_limit: options.fileSizeLimit,
              allowed_mime_types: options.allowedMimeTypes
            }, { headers: _this4.headers }),
            error: null
          };
        } catch (error) {
          if (_this4.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Removes all objects inside a single bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to empty.
      * @returns Promise with success message or error
      *
      * @example Empty bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .emptyBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully emptied"
      *   },
      *   "error": null
      * }
      * ```
      */
      async emptyBucket(id) {
        var _this5 = this;
        try {
          return {
            data: await post$1(_this5.fetch, `${_this5.url}/bucket/${id}/empty`, {}, { headers: _this5.headers }),
            error: null
          };
        } catch (error) {
          if (_this5.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
      * You must first `empty()` the bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to delete.
      * @returns Promise with success message or error
      *
      * @example Delete bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .deleteBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully deleted"
      *   },
      *   "error": null
      * }
      * ```
      */
      async deleteBucket(id) {
        var _this6 = this;
        try {
          return {
            data: await remove(_this6.fetch, `${_this6.url}/bucket/${id}`, {}, { headers: _this6.headers }),
            error: null
          };
        } catch (error) {
          if (_this6.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      listBucketOptionsToQueryString(options) {
        const params = {};
        if (options) {
          if ("limit" in options) params.limit = String(options.limit);
          if ("offset" in options) params.offset = String(options.offset);
          if (options.search) params.search = options.search;
          if (options.sortColumn) params.sortColumn = options.sortColumn;
          if (options.sortOrder) params.sortOrder = options.sortOrder;
        }
        return Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";
      }
    };
    var StorageAnalyticsClient = class {
      /**
      * @alpha
      *
      * Creates a new StorageAnalyticsClient instance
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param url - The base URL for the storage API
      * @param headers - HTTP headers to include in requests
      * @param fetch - Optional custom fetch implementation
      *
      * @example
      * ```typescript
      * const client = new StorageAnalyticsClient(url, headers)
      * ```
      */
      constructor(url, headers = {}, fetch$1) {
        this.shouldThrowOnError = false;
        this.url = url.replace(/\/$/, "");
        this.headers = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS$1), headers);
        this.fetch = resolveFetch$1(fetch$1);
      }
      /**
      * @alpha
      *
      * Enable throwing errors instead of returning them in the response
      * When enabled, failed operations will throw instead of returning { data: null, error }
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @returns This instance for method chaining
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * @alpha
      *
      * Creates a new analytics bucket using Iceberg tables
      * Analytics buckets are optimized for analytical queries and data processing
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param name A unique name for the bucket you are creating
      * @returns Promise with response containing newly created analytics bucket or error
      *
      * @example Create analytics bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .createBucket('analytics-data')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "name": "analytics-data",
      *     "type": "ANALYTICS",
      *     "format": "iceberg",
      *     "created_at": "2024-05-22T22:26:05.100Z",
      *     "updated_at": "2024-05-22T22:26:05.100Z"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createBucket(name) {
        var _this = this;
        try {
          return {
            data: await post$1(_this.fetch, `${_this.url}/bucket`, { name }, { headers: _this.headers }),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * @alpha
      *
      * Retrieves the details of all Analytics Storage buckets within an existing project
      * Only returns buckets of type 'ANALYTICS'
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param options Query parameters for listing buckets
      * @param options.limit Maximum number of buckets to return
      * @param options.offset Number of buckets to skip
      * @param options.sortColumn Column to sort by ('name', 'created_at', 'updated_at')
      * @param options.sortOrder Sort order ('asc' or 'desc')
      * @param options.search Search term to filter bucket names
      * @returns Promise with response containing array of analytics buckets or error
      *
      * @example List analytics buckets
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .listBuckets({
      *     limit: 10,
      *     offset: 0,
      *     sortColumn: 'created_at',
      *     sortOrder: 'desc'
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "analytics-data",
      *       "type": "ANALYTICS",
      *       "format": "iceberg",
      *       "created_at": "2024-05-22T22:26:05.100Z",
      *       "updated_at": "2024-05-22T22:26:05.100Z"
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      */
      async listBuckets(options) {
        var _this2 = this;
        try {
          const queryParams = new URLSearchParams();
          if ((options === null || options === void 0 ? void 0 : options.limit) !== void 0) queryParams.set("limit", options.limit.toString());
          if ((options === null || options === void 0 ? void 0 : options.offset) !== void 0) queryParams.set("offset", options.offset.toString());
          if (options === null || options === void 0 ? void 0 : options.sortColumn) queryParams.set("sortColumn", options.sortColumn);
          if (options === null || options === void 0 ? void 0 : options.sortOrder) queryParams.set("sortOrder", options.sortOrder);
          if (options === null || options === void 0 ? void 0 : options.search) queryParams.set("search", options.search);
          const queryString = queryParams.toString();
          const url = queryString ? `${_this2.url}/bucket?${queryString}` : `${_this2.url}/bucket`;
          return {
            data: await get(_this2.fetch, url, { headers: _this2.headers }),
            error: null
          };
        } catch (error) {
          if (_this2.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * @alpha
      *
      * Deletes an existing analytics bucket
      * A bucket can't be deleted with existing objects inside it
      * You must first empty the bucket before deletion
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param bucketName The unique identifier of the bucket you would like to delete
      * @returns Promise with response containing success message or error
      *
      * @example Delete analytics bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .deleteBucket('analytics-data')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully deleted"
      *   },
      *   "error": null
      * }
      * ```
      */
      async deleteBucket(bucketName) {
        var _this3 = this;
        try {
          return {
            data: await remove(_this3.fetch, `${_this3.url}/bucket/${bucketName}`, {}, { headers: _this3.headers }),
            error: null
          };
        } catch (error) {
          if (_this3.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /**
      * @alpha
      *
      * Get an Iceberg REST Catalog client configured for a specific analytics bucket
      * Use this to perform advanced table and namespace operations within the bucket
      * The returned client provides full access to the Apache Iceberg REST Catalog API
      * with the Supabase `{ data, error }` pattern for consistent error handling on all operations.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param bucketName - The name of the analytics bucket (warehouse) to connect to
      * @returns The wrapped Iceberg catalog client
      * @throws {StorageError} If the bucket name is invalid
      *
      * @example Get catalog and create table
      * ```js
      * // First, create an analytics bucket
      * const { data: bucket, error: bucketError } = await supabase
      *   .storage
      *   .analytics
      *   .createBucket('analytics-data')
      *
      * // Get the Iceberg catalog for that bucket
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // Create a namespace
      * const { error: nsError } = await catalog.createNamespace({ namespace: ['default'] })
      *
      * // Create a table with schema
      * const { data: tableMetadata, error: tableError } = await catalog.createTable(
      *   { namespace: ['default'] },
      *   {
      *     name: 'events',
      *     schema: {
      *       type: 'struct',
      *       fields: [
      *         { id: 1, name: 'id', type: 'long', required: true },
      *         { id: 2, name: 'timestamp', type: 'timestamp', required: true },
      *         { id: 3, name: 'user_id', type: 'string', required: false }
      *       ],
      *       'schema-id': 0,
      *       'identifier-field-ids': [1]
      *     },
      *     'partition-spec': {
      *       'spec-id': 0,
      *       fields: []
      *     },
      *     'write-order': {
      *       'order-id': 0,
      *       fields: []
      *     },
      *     properties: {
      *       'write.format.default': 'parquet'
      *     }
      *   }
      * )
      * ```
      *
      * @example List tables in namespace
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // List all tables in the default namespace
      * const { data: tables, error: listError } = await catalog.listTables({ namespace: ['default'] })
      * if (listError) {
      *   if (listError.isNotFound()) {
      *     console.log('Namespace not found')
      *   }
      *   return
      * }
      * console.log(tables) // [{ namespace: ['default'], name: 'events' }]
      * ```
      *
      * @example Working with namespaces
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // List all namespaces
      * const { data: namespaces } = await catalog.listNamespaces()
      *
      * // Create namespace with properties
      * await catalog.createNamespace(
      *   { namespace: ['production'] },
      *   { properties: { owner: 'data-team', env: 'prod' } }
      * )
      * ```
      *
      * @example Cleanup operations
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // Drop table with purge option (removes all data)
      * const { error: dropError } = await catalog.dropTable(
      *   { namespace: ['default'], name: 'events' },
      *   { purge: true }
      * )
      *
      * if (dropError?.isNotFound()) {
      *   console.log('Table does not exist')
      * }
      *
      * // Drop namespace (must be empty)
      * await catalog.dropNamespace({ namespace: ['default'] })
      * ```
      *
      * @remarks
      * This method provides a bridge between Supabase's bucket management and the standard
      * Apache Iceberg REST Catalog API. The bucket name maps to the Iceberg warehouse parameter.
      * All authentication and configuration is handled automatically using your Supabase credentials.
      *
      * **Error Handling**: Invalid bucket names throw immediately. All catalog
      * operations return `{ data, error }` where errors are `IcebergError` instances from iceberg-js.
      * Use helper methods like `error.isNotFound()` or check `error.status` for specific error handling.
      * Use `.throwOnError()` on the analytics client if you prefer exceptions for catalog operations.
      *
      * **Cleanup Operations**: When using `dropTable`, the `purge: true` option permanently
      * deletes all table data. Without it, the table is marked as deleted but data remains.
      *
      * **Library Dependency**: The returned catalog wraps `IcebergRestCatalog` from iceberg-js.
      * For complete API documentation and advanced usage, refer to the
      * [iceberg-js documentation](https://supabase.github.io/iceberg-js/).
      */
      from(bucketName) {
        var _this4 = this;
        if (!isValidBucketName(bucketName)) throw new StorageError("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
        const catalog = new iceberg_js.IcebergRestCatalog({
          baseUrl: this.url,
          catalogName: bucketName,
          auth: {
            type: "custom",
            getHeaders: async () => _this4.headers
          },
          fetch: this.fetch
        });
        const shouldThrowOnError = this.shouldThrowOnError;
        return new Proxy(catalog, { get(target, prop) {
          const value = target[prop];
          if (typeof value !== "function") return value;
          return async (...args) => {
            try {
              return {
                data: await value.apply(target, args),
                error: null
              };
            } catch (error) {
              if (shouldThrowOnError) throw error;
              return {
                data: null,
                error
              };
            }
          };
        } });
      }
    };
    var DEFAULT_HEADERS = {
      "X-Client-Info": `storage-js/${version}`,
      "Content-Type": "application/json"
    };
    var StorageVectorsError = class extends Error {
      constructor(message) {
        super(message);
        this.__isStorageVectorsError = true;
        this.name = "StorageVectorsError";
      }
    };
    function isStorageVectorsError(error) {
      return typeof error === "object" && error !== null && "__isStorageVectorsError" in error;
    }
    var StorageVectorsApiError = class extends StorageVectorsError {
      constructor(message, status, statusCode) {
        super(message);
        this.name = "StorageVectorsApiError";
        this.status = status;
        this.statusCode = statusCode;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          statusCode: this.statusCode
        };
      }
    };
    var StorageVectorsUnknownError = class extends StorageVectorsError {
      constructor(message, originalError) {
        super(message);
        this.name = "StorageVectorsUnknownError";
        this.originalError = originalError;
      }
    };
    var StorageVectorsErrorCode = /* @__PURE__ */ (function(StorageVectorsErrorCode$1) {
      StorageVectorsErrorCode$1["InternalError"] = "InternalError";
      StorageVectorsErrorCode$1["S3VectorConflictException"] = "S3VectorConflictException";
      StorageVectorsErrorCode$1["S3VectorNotFoundException"] = "S3VectorNotFoundException";
      StorageVectorsErrorCode$1["S3VectorBucketNotEmpty"] = "S3VectorBucketNotEmpty";
      StorageVectorsErrorCode$1["S3VectorMaxBucketsExceeded"] = "S3VectorMaxBucketsExceeded";
      StorageVectorsErrorCode$1["S3VectorMaxIndexesExceeded"] = "S3VectorMaxIndexesExceeded";
      return StorageVectorsErrorCode$1;
    })({});
    var resolveFetch = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    var resolveResponse = () => {
      return Response;
    };
    var isPlainObject2 = (value) => {
      if (typeof value !== "object" || value === null) return false;
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
    };
    var normalizeToFloat32 = (values) => {
      return Array.from(new Float32Array(values));
    };
    var validateVectorDimension = (vector, expectedDimension) => {
      if (expectedDimension !== void 0 && vector.float32.length !== expectedDimension) throw new Error(`Vector dimension mismatch: expected ${expectedDimension}, got ${vector.float32.length}`);
    };
    var _getErrorMessage = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
    var handleError = async (error, reject, options) => {
      if (error && typeof error === "object" && "status" in error && "ok" in error && typeof error.status === "number" && !(options === null || options === void 0 ? void 0 : options.noResolveJson)) {
        const status = error.status || 500;
        const responseError = error;
        if (typeof responseError.json === "function") responseError.json().then((err) => {
          const statusCode = (err === null || err === void 0 ? void 0 : err.statusCode) || (err === null || err === void 0 ? void 0 : err.code) || status + "";
          reject(new StorageVectorsApiError(_getErrorMessage(err), status, statusCode));
        }).catch(() => {
          const statusCode = status + "";
          reject(new StorageVectorsApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode));
        });
        else {
          const statusCode = status + "";
          reject(new StorageVectorsApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode));
        }
      } else reject(new StorageVectorsUnknownError(_getErrorMessage(error), error));
    };
    var _getRequestParams = (method, options, parameters, body) => {
      const params = {
        method,
        headers: (options === null || options === void 0 ? void 0 : options.headers) || {}
      };
      if (method === "GET" || !body) return params;
      if (isPlainObject2(body)) {
        params.headers = _objectSpread2({ "Content-Type": "application/json" }, options === null || options === void 0 ? void 0 : options.headers);
        params.body = JSON.stringify(body);
      } else params.body = body;
      return _objectSpread2(_objectSpread2({}, params), parameters);
    };
    async function _handleRequest(fetcher, method, url, options, parameters, body) {
      return new Promise((resolve, reject) => {
        fetcher(url, _getRequestParams(method, options, parameters, body)).then((result) => {
          if (!result.ok) throw result;
          if (options === null || options === void 0 ? void 0 : options.noResolveJson) return result;
          const contentType = result.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) return {};
          return result.json();
        }).then((data) => resolve(data)).catch((error) => handleError(error, reject, options));
      });
    }
    async function post(fetcher, url, body, options, parameters) {
      return _handleRequest(fetcher, "POST", url, options, parameters, body);
    }
    var VectorIndexApi = class {
      /** Creates a new VectorIndexApi instance */
      constructor(url, headers = {}, fetch$1) {
        this.shouldThrowOnError = false;
        this.url = url.replace(/\/$/, "");
        this.headers = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), headers);
        this.fetch = resolveFetch(fetch$1);
      }
      /** Enable throwing errors instead of returning them in the response */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /** Creates a new vector index within a bucket */
      async createIndex(options) {
        var _this = this;
        try {
          return {
            data: await post(_this.fetch, `${_this.url}/CreateIndex`, options, { headers: _this.headers }) || {},
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Retrieves metadata for a specific vector index */
      async getIndex(vectorBucketName, indexName) {
        var _this2 = this;
        try {
          return {
            data: await post(_this2.fetch, `${_this2.url}/GetIndex`, {
              vectorBucketName,
              indexName
            }, { headers: _this2.headers }),
            error: null
          };
        } catch (error) {
          if (_this2.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Lists vector indexes within a bucket with optional filtering and pagination */
      async listIndexes(options) {
        var _this3 = this;
        try {
          return {
            data: await post(_this3.fetch, `${_this3.url}/ListIndexes`, options, { headers: _this3.headers }),
            error: null
          };
        } catch (error) {
          if (_this3.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Deletes a vector index and all its data */
      async deleteIndex(vectorBucketName, indexName) {
        var _this4 = this;
        try {
          return {
            data: await post(_this4.fetch, `${_this4.url}/DeleteIndex`, {
              vectorBucketName,
              indexName
            }, { headers: _this4.headers }) || {},
            error: null
          };
        } catch (error) {
          if (_this4.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var VectorDataApi = class {
      /** Creates a new VectorDataApi instance */
      constructor(url, headers = {}, fetch$1) {
        this.shouldThrowOnError = false;
        this.url = url.replace(/\/$/, "");
        this.headers = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), headers);
        this.fetch = resolveFetch(fetch$1);
      }
      /** Enable throwing errors instead of returning them in the response */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /** Inserts or updates vectors in batch (1-500 per request) */
      async putVectors(options) {
        var _this = this;
        try {
          if (options.vectors.length < 1 || options.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
          return {
            data: await post(_this.fetch, `${_this.url}/PutVectors`, options, { headers: _this.headers }) || {},
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Retrieves vectors by their keys in batch */
      async getVectors(options) {
        var _this2 = this;
        try {
          return {
            data: await post(_this2.fetch, `${_this2.url}/GetVectors`, options, { headers: _this2.headers }),
            error: null
          };
        } catch (error) {
          if (_this2.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Lists vectors in an index with pagination */
      async listVectors(options) {
        var _this3 = this;
        try {
          if (options.segmentCount !== void 0) {
            if (options.segmentCount < 1 || options.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
            if (options.segmentIndex !== void 0) {
              if (options.segmentIndex < 0 || options.segmentIndex >= options.segmentCount) throw new Error(`segmentIndex must be between 0 and ${options.segmentCount - 1}`);
            }
          }
          return {
            data: await post(_this3.fetch, `${_this3.url}/ListVectors`, options, { headers: _this3.headers }),
            error: null
          };
        } catch (error) {
          if (_this3.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Queries for similar vectors using approximate nearest neighbor search */
      async queryVectors(options) {
        var _this4 = this;
        try {
          return {
            data: await post(_this4.fetch, `${_this4.url}/QueryVectors`, options, { headers: _this4.headers }),
            error: null
          };
        } catch (error) {
          if (_this4.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Deletes vectors by their keys in batch (1-500 per request) */
      async deleteVectors(options) {
        var _this5 = this;
        try {
          if (options.keys.length < 1 || options.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
          return {
            data: await post(_this5.fetch, `${_this5.url}/DeleteVectors`, options, { headers: _this5.headers }) || {},
            error: null
          };
        } catch (error) {
          if (_this5.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var VectorBucketApi = class {
      /** Creates a new VectorBucketApi instance */
      constructor(url, headers = {}, fetch$1) {
        this.shouldThrowOnError = false;
        this.url = url.replace(/\/$/, "");
        this.headers = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), headers);
        this.fetch = resolveFetch(fetch$1);
      }
      /** Enable throwing errors instead of returning them in the response */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /** Creates a new vector bucket */
      async createBucket(vectorBucketName) {
        var _this = this;
        try {
          return {
            data: await post(_this.fetch, `${_this.url}/CreateVectorBucket`, { vectorBucketName }, { headers: _this.headers }) || {},
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Retrieves metadata for a specific vector bucket */
      async getBucket(vectorBucketName) {
        var _this2 = this;
        try {
          return {
            data: await post(_this2.fetch, `${_this2.url}/GetVectorBucket`, { vectorBucketName }, { headers: _this2.headers }),
            error: null
          };
        } catch (error) {
          if (_this2.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Lists vector buckets with optional filtering and pagination */
      async listBuckets(options = {}) {
        var _this3 = this;
        try {
          return {
            data: await post(_this3.fetch, `${_this3.url}/ListVectorBuckets`, options, { headers: _this3.headers }),
            error: null
          };
        } catch (error) {
          if (_this3.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
      /** Deletes a vector bucket (must be empty first) */
      async deleteBucket(vectorBucketName) {
        var _this4 = this;
        try {
          return {
            data: await post(_this4.fetch, `${_this4.url}/DeleteVectorBucket`, { vectorBucketName }, { headers: _this4.headers }) || {},
            error: null
          };
        } catch (error) {
          if (_this4.shouldThrowOnError) throw error;
          if (isStorageVectorsError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var StorageVectorsClient = class extends VectorBucketApi {
      /**
      * @alpha
      *
      * Creates a StorageVectorsClient that can manage buckets, indexes, and vectors.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param url - Base URL of the Storage Vectors REST API.
      * @param options.headers - Optional headers (for example `Authorization`) applied to every request.
      * @param options.fetch - Optional custom `fetch` implementation for non-browser runtimes.
      *
      * @example
      * ```typescript
      * const client = new StorageVectorsClient(url, options)
      * ```
      */
      constructor(url, options = {}) {
        super(url, options.headers || {}, options.fetch);
      }
      /**
      *
      * @alpha
      *
      * Access operations for a specific vector bucket
      * Returns a scoped client for index and vector operations within the bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket
      * @returns Bucket-scoped client with index and vector operations
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * ```
      */
      from(vectorBucketName) {
        return new VectorBucketScope(this.url, this.headers, vectorBucketName, this.fetch);
      }
      /**
      *
      * @alpha
      *
      * Creates a new vector bucket
      * Vector buckets are containers for vector indexes and their data
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Unique name for the vector bucket
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .createBucket('embeddings-prod')
      * ```
      */
      async createBucket(vectorBucketName) {
        var _superprop_getCreateBucket = () => super.createBucket, _this = this;
        return _superprop_getCreateBucket().call(_this, vectorBucketName);
      }
      /**
      *
      * @alpha
      *
      * Retrieves metadata for a specific vector bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket
      * @returns Promise with bucket metadata or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .getBucket('embeddings-prod')
      *
      * console.log('Bucket created:', data?.vectorBucket.creationTime)
      * ```
      */
      async getBucket(vectorBucketName) {
        var _superprop_getGetBucket = () => super.getBucket, _this2 = this;
        return _superprop_getGetBucket().call(_this2, vectorBucketName);
      }
      /**
      *
      * @alpha
      *
      * Lists all vector buckets with optional filtering and pagination
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Optional filters (prefix, maxResults, nextToken)
      * @returns Promise with list of buckets or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .listBuckets({ prefix: 'embeddings-' })
      *
      * data?.vectorBuckets.forEach(bucket => {
      *   console.log(bucket.vectorBucketName)
      * })
      * ```
      */
      async listBuckets(options = {}) {
        var _superprop_getListBuckets = () => super.listBuckets, _this3 = this;
        return _superprop_getListBuckets().call(_this3, options);
      }
      /**
      *
      * @alpha
      *
      * Deletes a vector bucket (bucket must be empty)
      * All indexes must be deleted before deleting the bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket to delete
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .deleteBucket('embeddings-old')
      * ```
      */
      async deleteBucket(vectorBucketName) {
        var _superprop_getDeleteBucket = () => super.deleteBucket, _this4 = this;
        return _superprop_getDeleteBucket().call(_this4, vectorBucketName);
      }
    };
    var VectorBucketScope = class extends VectorIndexApi {
      /**
      * @alpha
      *
      * Creates a helper that automatically scopes all index operations to the provided bucket.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * ```
      */
      constructor(url, headers, vectorBucketName, fetch$1) {
        super(url, headers, fetch$1);
        this.vectorBucketName = vectorBucketName;
      }
      /**
      *
      * @alpha
      *
      * Creates a new vector index in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Index configuration (vectorBucketName is automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * await bucket.createIndex({
      *   indexName: 'documents-openai',
      *   dataType: 'float32',
      *   dimension: 1536,
      *   distanceMetric: 'cosine',
      *   metadataConfiguration: {
      *     nonFilterableMetadataKeys: ['raw_text']
      *   }
      * })
      * ```
      */
      async createIndex(options) {
        var _superprop_getCreateIndex = () => super.createIndex, _this5 = this;
        return _superprop_getCreateIndex().call(_this5, _objectSpread2(_objectSpread2({}, options), {}, { vectorBucketName: _this5.vectorBucketName }));
      }
      /**
      *
      * @alpha
      *
      * Lists indexes in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Listing options (vectorBucketName is automatically set)
      * @returns Promise with response containing indexes array and pagination token or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * const { data } = await bucket.listIndexes({ prefix: 'documents-' })
      * ```
      */
      async listIndexes(options = {}) {
        var _superprop_getListIndexes = () => super.listIndexes, _this6 = this;
        return _superprop_getListIndexes().call(_this6, _objectSpread2(_objectSpread2({}, options), {}, { vectorBucketName: _this6.vectorBucketName }));
      }
      /**
      *
      * @alpha
      *
      * Retrieves metadata for a specific index in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index to retrieve
      * @returns Promise with index metadata or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * const { data } = await bucket.getIndex('documents-openai')
      * console.log('Dimension:', data?.index.dimension)
      * ```
      */
      async getIndex(indexName) {
        var _superprop_getGetIndex = () => super.getIndex, _this7 = this;
        return _superprop_getGetIndex().call(_this7, _this7.vectorBucketName, indexName);
      }
      /**
      *
      * @alpha
      *
      * Deletes an index from this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index to delete
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * await bucket.deleteIndex('old-index')
      * ```
      */
      async deleteIndex(indexName) {
        var _superprop_getDeleteIndex = () => super.deleteIndex, _this8 = this;
        return _superprop_getDeleteIndex().call(_this8, _this8.vectorBucketName, indexName);
      }
      /**
      *
      * @alpha
      *
      * Access operations for a specific index within this bucket
      * Returns a scoped client for vector data operations
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index
      * @returns Index-scoped client with vector data operations
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      *
      * // Insert vectors
      * await index.putVectors({
      *   vectors: [
      *     { key: 'doc-1', data: { float32: [...] }, metadata: { title: 'Intro' } }
      *   ]
      * })
      *
      * // Query similar vectors
      * const { data } = await index.queryVectors({
      *   queryVector: { float32: [...] },
      *   topK: 5
      * })
      * ```
      */
      index(indexName) {
        return new VectorIndexScope(this.url, this.headers, this.vectorBucketName, indexName, this.fetch);
      }
    };
    var VectorIndexScope = class extends VectorDataApi {
      /**
      *
      * @alpha
      *
      * Creates a helper that automatically scopes all vector operations to the provided bucket/index names.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * ```
      */
      constructor(url, headers, vectorBucketName, indexName, fetch$1) {
        super(url, headers, fetch$1);
        this.vectorBucketName = vectorBucketName;
        this.indexName = indexName;
      }
      /**
      *
      * @alpha
      *
      * Inserts or updates vectors in this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Vector insertion options (bucket and index names automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * await index.putVectors({
      *   vectors: [
      *     {
      *       key: 'doc-1',
      *       data: { float32: [0.1, 0.2, ...] },
      *       metadata: { title: 'Introduction', page: 1 }
      *     }
      *   ]
      * })
      * ```
      */
      async putVectors(options) {
        var _superprop_getPutVectors = () => super.putVectors, _this9 = this;
        return _superprop_getPutVectors().call(_this9, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this9.vectorBucketName,
          indexName: _this9.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Retrieves vectors by keys from this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Vector retrieval options (bucket and index names automatically set)
      * @returns Promise with response containing vectors array or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.getVectors({
      *   keys: ['doc-1', 'doc-2'],
      *   returnMetadata: true
      * })
      * ```
      */
      async getVectors(options) {
        var _superprop_getGetVectors = () => super.getVectors, _this10 = this;
        return _superprop_getGetVectors().call(_this10, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this10.vectorBucketName,
          indexName: _this10.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Lists vectors in this index with pagination
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Listing options (bucket and index names automatically set)
      * @returns Promise with response containing vectors array and pagination token or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.listVectors({
      *   maxResults: 500,
      *   returnMetadata: true
      * })
      * ```
      */
      async listVectors(options = {}) {
        var _superprop_getListVectors = () => super.listVectors, _this11 = this;
        return _superprop_getListVectors().call(_this11, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this11.vectorBucketName,
          indexName: _this11.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Queries for similar vectors in this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Query options (bucket and index names automatically set)
      * @returns Promise with response containing matches array of similar vectors ordered by distance or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.queryVectors({
      *   queryVector: { float32: [0.1, 0.2, ...] },
      *   topK: 5,
      *   filter: { category: 'technical' },
      *   returnDistance: true,
      *   returnMetadata: true
      * })
      * ```
      */
      async queryVectors(options) {
        var _superprop_getQueryVectors = () => super.queryVectors, _this12 = this;
        return _superprop_getQueryVectors().call(_this12, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this12.vectorBucketName,
          indexName: _this12.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Deletes vectors by keys from this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Deletion options (bucket and index names automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * await index.deleteVectors({
      *   keys: ['doc-1', 'doc-2', 'doc-3']
      * })
      * ```
      */
      async deleteVectors(options) {
        var _superprop_getDeleteVectors = () => super.deleteVectors, _this13 = this;
        return _superprop_getDeleteVectors().call(_this13, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this13.vectorBucketName,
          indexName: _this13.indexName
        }));
      }
    };
    var StorageClient = class extends StorageBucketApi {
      /**
      * Creates a client for Storage buckets, files, analytics, and vectors.
      *
      * @category File Buckets
      * @example
      * ```ts
      * import { StorageClient } from '@supabase/storage-js'
      *
      * const storage = new StorageClient('https://xyzcompany.supabase.co/storage/v1', {
      *   apikey: 'public-anon-key',
      * })
      * const avatars = storage.from('avatars')
      * ```
      */
      constructor(url, headers = {}, fetch$1, opts) {
        super(url, headers, fetch$1, opts);
      }
      /**
      * Perform file operation in a bucket.
      *
      * @category File Buckets
      * @param id The bucket id to operate on.
      *
      * @example
      * ```typescript
      * const avatars = supabase.storage.from('avatars')
      * ```
      */
      from(id) {
        return new StorageFileApi(this.url, this.headers, id, this.fetch);
      }
      /**
      *
      * @alpha
      *
      * Access vector storage operations.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @returns A StorageVectorsClient instance configured with the current storage settings.
      */
      get vectors() {
        return new StorageVectorsClient(this.url + "/vector", {
          headers: this.headers,
          fetch: this.fetch
        });
      }
      /**
      *
      * @alpha
      *
      * Access analytics storage operations using Iceberg tables.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @returns A StorageAnalyticsClient instance configured with the current storage settings.
      */
      get analytics() {
        return new StorageAnalyticsClient(this.url + "/iceberg", this.headers, this.fetch);
      }
    };
    exports.StorageAnalyticsClient = StorageAnalyticsClient;
    exports.StorageApiError = StorageApiError;
    exports.StorageClient = StorageClient;
    exports.StorageError = StorageError;
    exports.StorageUnknownError = StorageUnknownError;
    exports.StorageVectorsApiError = StorageVectorsApiError;
    exports.StorageVectorsClient = StorageVectorsClient;
    exports.StorageVectorsError = StorageVectorsError;
    exports.StorageVectorsErrorCode = StorageVectorsErrorCode;
    exports.StorageVectorsUnknownError = StorageVectorsUnknownError;
    exports.VectorBucketApi = VectorBucketApi;
    exports.VectorBucketScope = VectorBucketScope;
    exports.VectorDataApi = VectorDataApi;
    exports.VectorIndexApi = VectorIndexApi;
    exports.VectorIndexScope = VectorIndexScope;
    exports.isPlainObject = isPlainObject2;
    exports.isStorageError = isStorageError;
    exports.isStorageVectorsError = isStorageVectorsError;
    exports.normalizeToFloat32 = normalizeToFloat32;
    exports.resolveFetch = resolveFetch;
    exports.resolveResponse = resolveResponse;
    exports.validateVectorDimension = validateVectorDimension;
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/version.js
var require_version2 = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "2.87.1";
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/constants.js
var require_constants2 = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_REALTIME_OPTIONS = exports.DEFAULT_AUTH_OPTIONS = exports.DEFAULT_DB_OPTIONS = exports.DEFAULT_GLOBAL_OPTIONS = exports.DEFAULT_HEADERS = void 0;
    var version_1 = require_version2();
    var JS_ENV = "";
    if (typeof Deno !== "undefined") {
      JS_ENV = "deno";
    } else if (typeof document !== "undefined") {
      JS_ENV = "web";
    } else if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
      JS_ENV = "react-native";
    } else {
      JS_ENV = "node";
    }
    exports.DEFAULT_HEADERS = { "X-Client-Info": `supabase-js-${JS_ENV}/${version_1.version}` };
    exports.DEFAULT_GLOBAL_OPTIONS = {
      headers: exports.DEFAULT_HEADERS
    };
    exports.DEFAULT_DB_OPTIONS = {
      schema: "public"
    };
    exports.DEFAULT_AUTH_OPTIONS = {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "implicit"
    };
    exports.DEFAULT_REALTIME_OPTIONS = {};
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/fetch.js
var require_fetch = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/fetch.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fetchWithAuth = exports.resolveHeadersConstructor = exports.resolveFetch = void 0;
    var resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports.resolveFetch = resolveFetch;
    var resolveHeadersConstructor = () => {
      return Headers;
    };
    exports.resolveHeadersConstructor = resolveHeadersConstructor;
    var fetchWithAuth = (supabaseKey, getAccessToken, customFetch) => {
      const fetch2 = (0, exports.resolveFetch)(customFetch);
      const HeadersConstructor = (0, exports.resolveHeadersConstructor)();
      return async (input, init) => {
        var _a;
        const accessToken = (_a = await getAccessToken()) !== null && _a !== void 0 ? _a : supabaseKey;
        let headers = new HeadersConstructor(init === null || init === void 0 ? void 0 : init.headers);
        if (!headers.has("apikey")) {
          headers.set("apikey", supabaseKey);
        }
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${accessToken}`);
        }
        return fetch2(input, Object.assign(Object.assign({}, init), { headers }));
      };
    };
    exports.fetchWithAuth = fetchWithAuth;
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/helpers.js
var require_helpers = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isBrowser = void 0;
    exports.uuid = uuid;
    exports.ensureTrailingSlash = ensureTrailingSlash;
    exports.applySettingDefaults = applySettingDefaults;
    exports.validateSupabaseUrl = validateSupabaseUrl;
    function uuid() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
        return v.toString(16);
      });
    }
    function ensureTrailingSlash(url) {
      return url.endsWith("/") ? url : url + "/";
    }
    var isBrowser = () => typeof window !== "undefined";
    exports.isBrowser = isBrowser;
    function applySettingDefaults(options, defaults) {
      var _a, _b;
      const { db: dbOptions, auth: authOptions, realtime: realtimeOptions, global: globalOptions } = options;
      const { db: DEFAULT_DB_OPTIONS, auth: DEFAULT_AUTH_OPTIONS, realtime: DEFAULT_REALTIME_OPTIONS, global: DEFAULT_GLOBAL_OPTIONS } = defaults;
      const result = {
        db: Object.assign(Object.assign({}, DEFAULT_DB_OPTIONS), dbOptions),
        auth: Object.assign(Object.assign({}, DEFAULT_AUTH_OPTIONS), authOptions),
        realtime: Object.assign(Object.assign({}, DEFAULT_REALTIME_OPTIONS), realtimeOptions),
        storage: {},
        global: Object.assign(Object.assign(Object.assign({}, DEFAULT_GLOBAL_OPTIONS), globalOptions), { headers: Object.assign(Object.assign({}, (_a = DEFAULT_GLOBAL_OPTIONS === null || DEFAULT_GLOBAL_OPTIONS === void 0 ? void 0 : DEFAULT_GLOBAL_OPTIONS.headers) !== null && _a !== void 0 ? _a : {}), (_b = globalOptions === null || globalOptions === void 0 ? void 0 : globalOptions.headers) !== null && _b !== void 0 ? _b : {}) }),
        accessToken: async () => ""
      };
      if (options.accessToken) {
        result.accessToken = options.accessToken;
      } else {
        delete result.accessToken;
      }
      return result;
    }
    function validateSupabaseUrl(supabaseUrl) {
      const trimmedUrl = supabaseUrl === null || supabaseUrl === void 0 ? void 0 : supabaseUrl.trim();
      if (!trimmedUrl) {
        throw new Error("supabaseUrl is required.");
      }
      if (!trimmedUrl.match(/^https?:\/\//i)) {
        throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
      }
      try {
        return new URL(ensureTrailingSlash(trimmedUrl));
      } catch (_a) {
        throw Error("Invalid supabaseUrl: Provided URL is malformed.");
      }
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/version.js
var require_version3 = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "2.91.1";
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/constants.js
var require_constants3 = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.JWKS_TTL = exports.BASE64URL_REGEX = exports.API_VERSIONS = exports.API_VERSION_HEADER_NAME = exports.NETWORK_FAILURE = exports.DEFAULT_HEADERS = exports.AUDIENCE = exports.STORAGE_KEY = exports.GOTRUE_URL = exports.EXPIRY_MARGIN_MS = exports.AUTO_REFRESH_TICK_THRESHOLD = exports.AUTO_REFRESH_TICK_DURATION_MS = void 0;
    var version_1 = require_version3();
    exports.AUTO_REFRESH_TICK_DURATION_MS = 30 * 1e3;
    exports.AUTO_REFRESH_TICK_THRESHOLD = 3;
    exports.EXPIRY_MARGIN_MS = exports.AUTO_REFRESH_TICK_THRESHOLD * exports.AUTO_REFRESH_TICK_DURATION_MS;
    exports.GOTRUE_URL = "http://localhost:9999";
    exports.STORAGE_KEY = "supabase.auth.token";
    exports.AUDIENCE = "";
    exports.DEFAULT_HEADERS = { "X-Client-Info": `gotrue-js/${version_1.version}` };
    exports.NETWORK_FAILURE = {
      MAX_RETRIES: 10,
      RETRY_INTERVAL: 2
      // in deciseconds
    };
    exports.API_VERSION_HEADER_NAME = "X-Supabase-Api-Version";
    exports.API_VERSIONS = {
      "2024-01-01": {
        timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
        name: "2024-01-01"
      }
    };
    exports.BASE64URL_REGEX = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i;
    exports.JWKS_TTL = 10 * 60 * 1e3;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/errors.js
var require_errors = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AuthInvalidJwtError = exports.AuthWeakPasswordError = exports.AuthRetryableFetchError = exports.AuthPKCECodeVerifierMissingError = exports.AuthPKCEGrantCodeExchangeError = exports.AuthImplicitGrantRedirectError = exports.AuthInvalidCredentialsError = exports.AuthInvalidTokenResponseError = exports.AuthSessionMissingError = exports.CustomAuthError = exports.AuthUnknownError = exports.AuthApiError = exports.AuthError = void 0;
    exports.isAuthError = isAuthError2;
    exports.isAuthApiError = isAuthApiError2;
    exports.isAuthSessionMissingError = isAuthSessionMissingError2;
    exports.isAuthImplicitGrantRedirectError = isAuthImplicitGrantRedirectError2;
    exports.isAuthPKCECodeVerifierMissingError = isAuthPKCECodeVerifierMissingError;
    exports.isAuthRetryableFetchError = isAuthRetryableFetchError2;
    exports.isAuthWeakPasswordError = isAuthWeakPasswordError2;
    var AuthError2 = class extends Error {
      constructor(message, status, code) {
        super(message);
        this.__isAuthError = true;
        this.name = "AuthError";
        this.status = status;
        this.code = code;
      }
    };
    exports.AuthError = AuthError2;
    function isAuthError2(error) {
      return typeof error === "object" && error !== null && "__isAuthError" in error;
    }
    var AuthApiError2 = class extends AuthError2 {
      constructor(message, status, code) {
        super(message, status, code);
        this.name = "AuthApiError";
        this.status = status;
        this.code = code;
      }
    };
    exports.AuthApiError = AuthApiError2;
    function isAuthApiError2(error) {
      return isAuthError2(error) && error.name === "AuthApiError";
    }
    var AuthUnknownError2 = class extends AuthError2 {
      constructor(message, originalError) {
        super(message);
        this.name = "AuthUnknownError";
        this.originalError = originalError;
      }
    };
    exports.AuthUnknownError = AuthUnknownError2;
    var CustomAuthError2 = class extends AuthError2 {
      constructor(message, name, status, code) {
        super(message, status, code);
        this.name = name;
        this.status = status;
      }
    };
    exports.CustomAuthError = CustomAuthError2;
    var AuthSessionMissingError2 = class extends CustomAuthError2 {
      constructor() {
        super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
      }
    };
    exports.AuthSessionMissingError = AuthSessionMissingError2;
    function isAuthSessionMissingError2(error) {
      return isAuthError2(error) && error.name === "AuthSessionMissingError";
    }
    var AuthInvalidTokenResponseError2 = class extends CustomAuthError2 {
      constructor() {
        super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
      }
    };
    exports.AuthInvalidTokenResponseError = AuthInvalidTokenResponseError2;
    var AuthInvalidCredentialsError2 = class extends CustomAuthError2 {
      constructor(message) {
        super(message, "AuthInvalidCredentialsError", 400, void 0);
      }
    };
    exports.AuthInvalidCredentialsError = AuthInvalidCredentialsError2;
    var AuthImplicitGrantRedirectError2 = class extends CustomAuthError2 {
      constructor(message, details = null) {
        super(message, "AuthImplicitGrantRedirectError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    exports.AuthImplicitGrantRedirectError = AuthImplicitGrantRedirectError2;
    function isAuthImplicitGrantRedirectError2(error) {
      return isAuthError2(error) && error.name === "AuthImplicitGrantRedirectError";
    }
    var AuthPKCEGrantCodeExchangeError2 = class extends CustomAuthError2 {
      constructor(message, details = null) {
        super(message, "AuthPKCEGrantCodeExchangeError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    exports.AuthPKCEGrantCodeExchangeError = AuthPKCEGrantCodeExchangeError2;
    var AuthPKCECodeVerifierMissingError = class extends CustomAuthError2 {
      constructor() {
        super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
      }
    };
    exports.AuthPKCECodeVerifierMissingError = AuthPKCECodeVerifierMissingError;
    function isAuthPKCECodeVerifierMissingError(error) {
      return isAuthError2(error) && error.name === "AuthPKCECodeVerifierMissingError";
    }
    var AuthRetryableFetchError2 = class extends CustomAuthError2 {
      constructor(message, status) {
        super(message, "AuthRetryableFetchError", status, void 0);
      }
    };
    exports.AuthRetryableFetchError = AuthRetryableFetchError2;
    function isAuthRetryableFetchError2(error) {
      return isAuthError2(error) && error.name === "AuthRetryableFetchError";
    }
    var AuthWeakPasswordError2 = class extends CustomAuthError2 {
      constructor(message, status, reasons) {
        super(message, "AuthWeakPasswordError", status, "weak_password");
        this.reasons = reasons;
      }
    };
    exports.AuthWeakPasswordError = AuthWeakPasswordError2;
    function isAuthWeakPasswordError2(error) {
      return isAuthError2(error) && error.name === "AuthWeakPasswordError";
    }
    var AuthInvalidJwtError2 = class extends CustomAuthError2 {
      constructor(message) {
        super(message, "AuthInvalidJwtError", 400, "invalid_jwt");
      }
    };
    exports.AuthInvalidJwtError = AuthInvalidJwtError2;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/base64url.js
var require_base64url = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/base64url.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.byteToBase64URL = byteToBase64URL;
    exports.byteFromBase64URL = byteFromBase64URL;
    exports.stringToBase64URL = stringToBase64URL;
    exports.stringFromBase64URL = stringFromBase64URL;
    exports.codepointToUTF8 = codepointToUTF8;
    exports.stringToUTF8 = stringToUTF8;
    exports.stringFromUTF8 = stringFromUTF8;
    exports.base64UrlToUint8Array = base64UrlToUint8Array;
    exports.stringToUint8Array = stringToUint8Array;
    exports.bytesToBase64URL = bytesToBase64URL;
    var TO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
    var IGNORE_BASE64URL = " 	\n\r=".split("");
    var FROM_BASE64URL = (() => {
      const charMap = new Array(128);
      for (let i = 0; i < charMap.length; i += 1) {
        charMap[i] = -1;
      }
      for (let i = 0; i < IGNORE_BASE64URL.length; i += 1) {
        charMap[IGNORE_BASE64URL[i].charCodeAt(0)] = -2;
      }
      for (let i = 0; i < TO_BASE64URL.length; i += 1) {
        charMap[TO_BASE64URL[i].charCodeAt(0)] = i;
      }
      return charMap;
    })();
    function byteToBase64URL(byte, state3, emit) {
      if (byte !== null) {
        state3.queue = state3.queue << 8 | byte;
        state3.queuedBits += 8;
        while (state3.queuedBits >= 6) {
          const pos = state3.queue >> state3.queuedBits - 6 & 63;
          emit(TO_BASE64URL[pos]);
          state3.queuedBits -= 6;
        }
      } else if (state3.queuedBits > 0) {
        state3.queue = state3.queue << 6 - state3.queuedBits;
        state3.queuedBits = 6;
        while (state3.queuedBits >= 6) {
          const pos = state3.queue >> state3.queuedBits - 6 & 63;
          emit(TO_BASE64URL[pos]);
          state3.queuedBits -= 6;
        }
      }
    }
    function byteFromBase64URL(charCode, state3, emit) {
      const bits = FROM_BASE64URL[charCode];
      if (bits > -1) {
        state3.queue = state3.queue << 6 | bits;
        state3.queuedBits += 6;
        while (state3.queuedBits >= 8) {
          emit(state3.queue >> state3.queuedBits - 8 & 255);
          state3.queuedBits -= 8;
        }
      } else if (bits === -2) {
        return;
      } else {
        throw new Error(`Invalid Base64-URL character "${String.fromCharCode(charCode)}"`);
      }
    }
    function stringToBase64URL(str) {
      const base64 = [];
      const emitter = (char) => {
        base64.push(char);
      };
      const state3 = { queue: 0, queuedBits: 0 };
      stringToUTF8(str, (byte) => {
        byteToBase64URL(byte, state3, emitter);
      });
      byteToBase64URL(null, state3, emitter);
      return base64.join("");
    }
    function stringFromBase64URL(str) {
      const conv = [];
      const utf8Emit = (codepoint) => {
        conv.push(String.fromCodePoint(codepoint));
      };
      const utf8State = {
        utf8seq: 0,
        codepoint: 0
      };
      const b64State = { queue: 0, queuedBits: 0 };
      const byteEmit = (byte) => {
        stringFromUTF8(byte, utf8State, utf8Emit);
      };
      for (let i = 0; i < str.length; i += 1) {
        byteFromBase64URL(str.charCodeAt(i), b64State, byteEmit);
      }
      return conv.join("");
    }
    function codepointToUTF8(codepoint, emit) {
      if (codepoint <= 127) {
        emit(codepoint);
        return;
      } else if (codepoint <= 2047) {
        emit(192 | codepoint >> 6);
        emit(128 | codepoint & 63);
        return;
      } else if (codepoint <= 65535) {
        emit(224 | codepoint >> 12);
        emit(128 | codepoint >> 6 & 63);
        emit(128 | codepoint & 63);
        return;
      } else if (codepoint <= 1114111) {
        emit(240 | codepoint >> 18);
        emit(128 | codepoint >> 12 & 63);
        emit(128 | codepoint >> 6 & 63);
        emit(128 | codepoint & 63);
        return;
      }
      throw new Error(`Unrecognized Unicode codepoint: ${codepoint.toString(16)}`);
    }
    function stringToUTF8(str, emit) {
      for (let i = 0; i < str.length; i += 1) {
        let codepoint = str.charCodeAt(i);
        if (codepoint > 55295 && codepoint <= 56319) {
          const highSurrogate = (codepoint - 55296) * 1024 & 65535;
          const lowSurrogate = str.charCodeAt(i + 1) - 56320 & 65535;
          codepoint = (lowSurrogate | highSurrogate) + 65536;
          i += 1;
        }
        codepointToUTF8(codepoint, emit);
      }
    }
    function stringFromUTF8(byte, state3, emit) {
      if (state3.utf8seq === 0) {
        if (byte <= 127) {
          emit(byte);
          return;
        }
        for (let leadingBit = 1; leadingBit < 6; leadingBit += 1) {
          if ((byte >> 7 - leadingBit & 1) === 0) {
            state3.utf8seq = leadingBit;
            break;
          }
        }
        if (state3.utf8seq === 2) {
          state3.codepoint = byte & 31;
        } else if (state3.utf8seq === 3) {
          state3.codepoint = byte & 15;
        } else if (state3.utf8seq === 4) {
          state3.codepoint = byte & 7;
        } else {
          throw new Error("Invalid UTF-8 sequence");
        }
        state3.utf8seq -= 1;
      } else if (state3.utf8seq > 0) {
        if (byte <= 127) {
          throw new Error("Invalid UTF-8 sequence");
        }
        state3.codepoint = state3.codepoint << 6 | byte & 63;
        state3.utf8seq -= 1;
        if (state3.utf8seq === 0) {
          emit(state3.codepoint);
        }
      }
    }
    function base64UrlToUint8Array(str) {
      const result = [];
      const state3 = { queue: 0, queuedBits: 0 };
      const onByte = (byte) => {
        result.push(byte);
      };
      for (let i = 0; i < str.length; i += 1) {
        byteFromBase64URL(str.charCodeAt(i), state3, onByte);
      }
      return new Uint8Array(result);
    }
    function stringToUint8Array(str) {
      const result = [];
      stringToUTF8(str, (byte) => result.push(byte));
      return new Uint8Array(result);
    }
    function bytesToBase64URL(bytes) {
      const result = [];
      const state3 = { queue: 0, queuedBits: 0 };
      const onChar = (char) => {
        result.push(char);
      };
      bytes.forEach((byte) => byteToBase64URL(byte, state3, onChar));
      byteToBase64URL(null, state3, onChar);
      return result.join("");
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/helpers.js
var require_helpers2 = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Deferred = exports.removeItemAsync = exports.getItemAsync = exports.setItemAsync = exports.looksLikeFetchResponse = exports.resolveFetch = exports.supportsLocalStorage = exports.isBrowser = void 0;
    exports.expiresAt = expiresAt;
    exports.generateCallbackId = generateCallbackId;
    exports.parseParametersFromURL = parseParametersFromURL;
    exports.decodeJWT = decodeJWT;
    exports.sleep = sleep;
    exports.retryable = retryable;
    exports.generatePKCEVerifier = generatePKCEVerifier;
    exports.generatePKCEChallenge = generatePKCEChallenge;
    exports.getCodeChallengeAndMethod = getCodeChallengeAndMethod;
    exports.parseResponseAPIVersion = parseResponseAPIVersion;
    exports.validateExp = validateExp;
    exports.getAlgorithm = getAlgorithm;
    exports.validateUUID = validateUUID;
    exports.userNotAvailableProxy = userNotAvailableProxy;
    exports.insecureUserWarningProxy = insecureUserWarningProxy;
    exports.deepClone = deepClone;
    var constants_1 = require_constants3();
    var errors_1 = require_errors();
    var base64url_1 = require_base64url();
    function expiresAt(expiresIn) {
      const timeNow = Math.round(Date.now() / 1e3);
      return timeNow + expiresIn;
    }
    function generateCallbackId() {
      return /* @__PURE__ */ Symbol("auth-callback");
    }
    var isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
    exports.isBrowser = isBrowser;
    var localStorageWriteTests = {
      tested: false,
      writable: false
    };
    var supportsLocalStorage = () => {
      if (!(0, exports.isBrowser)()) {
        return false;
      }
      try {
        if (typeof globalThis.localStorage !== "object") {
          return false;
        }
      } catch (e) {
        return false;
      }
      if (localStorageWriteTests.tested) {
        return localStorageWriteTests.writable;
      }
      const randomKey = `lswt-${Math.random()}${Math.random()}`;
      try {
        globalThis.localStorage.setItem(randomKey, randomKey);
        globalThis.localStorage.removeItem(randomKey);
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = true;
      } catch (e) {
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = false;
      }
      return localStorageWriteTests.writable;
    };
    exports.supportsLocalStorage = supportsLocalStorage;
    function parseParametersFromURL(href) {
      const result = {};
      const url = new URL(href);
      if (url.hash && url.hash[0] === "#") {
        try {
          const hashSearchParams = new URLSearchParams(url.hash.substring(1));
          hashSearchParams.forEach((value, key) => {
            result[key] = value;
          });
        } catch (e) {
        }
      }
      url.searchParams.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    var resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports.resolveFetch = resolveFetch;
    var looksLikeFetchResponse = (maybeResponse) => {
      return typeof maybeResponse === "object" && maybeResponse !== null && "status" in maybeResponse && "ok" in maybeResponse && "json" in maybeResponse && typeof maybeResponse.json === "function";
    };
    exports.looksLikeFetchResponse = looksLikeFetchResponse;
    var setItemAsync = async (storage, key, data) => {
      await storage.setItem(key, JSON.stringify(data));
    };
    exports.setItemAsync = setItemAsync;
    var getItemAsync = async (storage, key) => {
      const value = await storage.getItem(key);
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch (_a) {
        return value;
      }
    };
    exports.getItemAsync = getItemAsync;
    var removeItemAsync = async (storage, key) => {
      await storage.removeItem(key);
    };
    exports.removeItemAsync = removeItemAsync;
    var Deferred = class _Deferred {
      constructor() {
        ;
        this.promise = new _Deferred.promiseConstructor((res, rej) => {
          ;
          this.resolve = res;
          this.reject = rej;
        });
      }
    };
    exports.Deferred = Deferred;
    Deferred.promiseConstructor = Promise;
    function decodeJWT(token) {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new errors_1.AuthInvalidJwtError("Invalid JWT structure");
      }
      for (let i = 0; i < parts.length; i++) {
        if (!constants_1.BASE64URL_REGEX.test(parts[i])) {
          throw new errors_1.AuthInvalidJwtError("JWT not in base64url format");
        }
      }
      const data = {
        // using base64url lib
        header: JSON.parse((0, base64url_1.stringFromBase64URL)(parts[0])),
        payload: JSON.parse((0, base64url_1.stringFromBase64URL)(parts[1])),
        signature: (0, base64url_1.base64UrlToUint8Array)(parts[2]),
        raw: {
          header: parts[0],
          payload: parts[1]
        }
      };
      return data;
    }
    async function sleep(time) {
      return await new Promise((accept) => {
        setTimeout(() => accept(null), time);
      });
    }
    function retryable(fn, isRetryable) {
      const promise = new Promise((accept, reject) => {
        ;
        (async () => {
          for (let attempt = 0; attempt < Infinity; attempt++) {
            try {
              const result = await fn(attempt);
              if (!isRetryable(attempt, null, result)) {
                accept(result);
                return;
              }
            } catch (e) {
              if (!isRetryable(attempt, e)) {
                reject(e);
                return;
              }
            }
          }
        })();
      });
      return promise;
    }
    function dec2hex(dec) {
      return ("0" + dec.toString(16)).substr(-2);
    }
    function generatePKCEVerifier() {
      const verifierLength = 56;
      const array = new Uint32Array(verifierLength);
      if (typeof crypto === "undefined") {
        const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        const charSetLen = charSet.length;
        let verifier = "";
        for (let i = 0; i < verifierLength; i++) {
          verifier += charSet.charAt(Math.floor(Math.random() * charSetLen));
        }
        return verifier;
      }
      crypto.getRandomValues(array);
      return Array.from(array, dec2hex).join("");
    }
    async function sha256(randomString) {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(randomString);
      const hash = await crypto.subtle.digest("SHA-256", encodedData);
      const bytes = new Uint8Array(hash);
      return Array.from(bytes).map((c) => String.fromCharCode(c)).join("");
    }
    async function generatePKCEChallenge(verifier) {
      const hasCryptoSupport = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined";
      if (!hasCryptoSupport) {
        console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.");
        return verifier;
      }
      const hashed = await sha256(verifier);
      return btoa(hashed).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    async function getCodeChallengeAndMethod(storage, storageKey, isPasswordRecovery = false) {
      const codeVerifier = generatePKCEVerifier();
      let storedCodeVerifier = codeVerifier;
      if (isPasswordRecovery) {
        storedCodeVerifier += "/PASSWORD_RECOVERY";
      }
      await (0, exports.setItemAsync)(storage, `${storageKey}-code-verifier`, storedCodeVerifier);
      const codeChallenge = await generatePKCEChallenge(codeVerifier);
      const codeChallengeMethod = codeVerifier === codeChallenge ? "plain" : "s256";
      return [codeChallenge, codeChallengeMethod];
    }
    var API_VERSION_REGEX = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
    function parseResponseAPIVersion(response) {
      const apiVersion = response.headers.get(constants_1.API_VERSION_HEADER_NAME);
      if (!apiVersion) {
        return null;
      }
      if (!apiVersion.match(API_VERSION_REGEX)) {
        return null;
      }
      try {
        const date = /* @__PURE__ */ new Date(`${apiVersion}T00:00:00.0Z`);
        return date;
      } catch (e) {
        return null;
      }
    }
    function validateExp(exp) {
      if (!exp) {
        throw new Error("Missing exp claim");
      }
      const timeNow = Math.floor(Date.now() / 1e3);
      if (exp <= timeNow) {
        throw new Error("JWT has expired");
      }
    }
    function getAlgorithm(alg) {
      switch (alg) {
        case "RS256":
          return {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" }
          };
        case "ES256":
          return {
            name: "ECDSA",
            namedCurve: "P-256",
            hash: { name: "SHA-256" }
          };
        default:
          throw new Error("Invalid alg claim");
      }
    }
    var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    function validateUUID(str) {
      if (!UUID_REGEX.test(str)) {
        throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
      }
    }
    function userNotAvailableProxy() {
      const proxyTarget = {};
      return new Proxy(proxyTarget, {
        get: (target, prop) => {
          if (prop === "__isUserNotAvailableProxy") {
            return true;
          }
          if (typeof prop === "symbol") {
            const sProp = prop.toString();
            if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)") {
              return void 0;
            }
          }
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${prop}" property of the session object is not supported. Please use getUser() instead.`);
        },
        set: (_target, prop) => {
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
        },
        deleteProperty: (_target, prop) => {
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
        }
      });
    }
    function insecureUserWarningProxy(user, suppressWarningRef) {
      return new Proxy(user, {
        get: (target, prop, receiver) => {
          if (prop === "__isInsecureUserWarningProxy") {
            return true;
          }
          if (typeof prop === "symbol") {
            const sProp = prop.toString();
            if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)" || sProp === "Symbol(nodejs.util.inspect.custom)") {
              return Reflect.get(target, prop, receiver);
            }
          }
          if (!suppressWarningRef.value && typeof prop === "string") {
            console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server.");
            suppressWarningRef.value = true;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    }
    function deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/fetch.js
var require_fetch2 = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/fetch.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.handleError = handleError;
    exports._request = _request;
    exports._sessionResponse = _sessionResponse;
    exports._sessionResponsePassword = _sessionResponsePassword;
    exports._userResponse = _userResponse;
    exports._ssoResponse = _ssoResponse;
    exports._generateLinkResponse = _generateLinkResponse;
    exports._noResolveJsonResponse = _noResolveJsonResponse;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var constants_1 = require_constants3();
    var helpers_1 = require_helpers2();
    var errors_1 = require_errors();
    var _getErrorMessage = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
    var NETWORK_ERROR_CODES = [502, 503, 504];
    async function handleError(error) {
      var _a;
      if (!(0, helpers_1.looksLikeFetchResponse)(error)) {
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage(error), 0);
      }
      if (NETWORK_ERROR_CODES.includes(error.status)) {
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage(error), error.status);
      }
      let data;
      try {
        data = await error.json();
      } catch (e) {
        throw new errors_1.AuthUnknownError(_getErrorMessage(e), e);
      }
      let errorCode = void 0;
      const responseAPIVersion = (0, helpers_1.parseResponseAPIVersion)(error);
      if (responseAPIVersion && responseAPIVersion.getTime() >= constants_1.API_VERSIONS["2024-01-01"].timestamp && typeof data === "object" && data && typeof data.code === "string") {
        errorCode = data.code;
      } else if (typeof data === "object" && data && typeof data.error_code === "string") {
        errorCode = data.error_code;
      }
      if (!errorCode) {
        if (typeof data === "object" && data && typeof data.weak_password === "object" && data.weak_password && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
          throw new errors_1.AuthWeakPasswordError(_getErrorMessage(data), error.status, data.weak_password.reasons);
        }
      } else if (errorCode === "weak_password") {
        throw new errors_1.AuthWeakPasswordError(_getErrorMessage(data), error.status, ((_a = data.weak_password) === null || _a === void 0 ? void 0 : _a.reasons) || []);
      } else if (errorCode === "session_not_found") {
        throw new errors_1.AuthSessionMissingError();
      }
      throw new errors_1.AuthApiError(_getErrorMessage(data), error.status || 500, errorCode);
    }
    var _getRequestParams = (method, options, parameters, body) => {
      const params = { method, headers: (options === null || options === void 0 ? void 0 : options.headers) || {} };
      if (method === "GET") {
        return params;
      }
      params.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, options === null || options === void 0 ? void 0 : options.headers);
      params.body = JSON.stringify(body);
      return Object.assign(Object.assign({}, params), parameters);
    };
    async function _request(fetcher, method, url, options) {
      var _a;
      const headers = Object.assign({}, options === null || options === void 0 ? void 0 : options.headers);
      if (!headers[constants_1.API_VERSION_HEADER_NAME]) {
        headers[constants_1.API_VERSION_HEADER_NAME] = constants_1.API_VERSIONS["2024-01-01"].name;
      }
      if (options === null || options === void 0 ? void 0 : options.jwt) {
        headers["Authorization"] = `Bearer ${options.jwt}`;
      }
      const qs = (_a = options === null || options === void 0 ? void 0 : options.query) !== null && _a !== void 0 ? _a : {};
      if (options === null || options === void 0 ? void 0 : options.redirectTo) {
        qs["redirect_to"] = options.redirectTo;
      }
      const queryString = Object.keys(qs).length ? "?" + new URLSearchParams(qs).toString() : "";
      const data = await _handleRequest(fetcher, method, url + queryString, {
        headers,
        noResolveJson: options === null || options === void 0 ? void 0 : options.noResolveJson
      }, {}, options === null || options === void 0 ? void 0 : options.body);
      return (options === null || options === void 0 ? void 0 : options.xform) ? options === null || options === void 0 ? void 0 : options.xform(data) : { data: Object.assign({}, data), error: null };
    }
    async function _handleRequest(fetcher, method, url, options, parameters, body) {
      const requestParams = _getRequestParams(method, options, parameters, body);
      let result;
      try {
        result = await fetcher(url, Object.assign({}, requestParams));
      } catch (e) {
        console.error(e);
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage(e), 0);
      }
      if (!result.ok) {
        await handleError(result);
      }
      if (options === null || options === void 0 ? void 0 : options.noResolveJson) {
        return result;
      }
      try {
        return await result.json();
      } catch (e) {
        await handleError(e);
      }
    }
    function _sessionResponse(data) {
      var _a;
      let session = null;
      if (hasSession(data)) {
        session = Object.assign({}, data);
        if (!data.expires_at) {
          session.expires_at = (0, helpers_1.expiresAt)(data.expires_in);
        }
      }
      const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
      return { data: { session, user }, error: null };
    }
    function _sessionResponsePassword(data) {
      const response = _sessionResponse(data);
      if (!response.error && data.weak_password && typeof data.weak_password === "object" && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.message && typeof data.weak_password.message === "string" && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
        response.data.weak_password = data.weak_password;
      }
      return response;
    }
    function _userResponse(data) {
      var _a;
      const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
      return { data: { user }, error: null };
    }
    function _ssoResponse(data) {
      return { data, error: null };
    }
    function _generateLinkResponse(data) {
      const { action_link, email_otp, hashed_token, redirect_to, verification_type } = data, rest = tslib_1.__rest(data, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]);
      const properties = {
        action_link,
        email_otp,
        hashed_token,
        redirect_to,
        verification_type
      };
      const user = Object.assign({}, rest);
      return {
        data: {
          properties,
          user
        },
        error: null
      };
    }
    function _noResolveJsonResponse(data) {
      return data;
    }
    function hasSession(data) {
      return data.access_token && data.refresh_token && data.expires_in;
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/types.js
var require_types2 = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SIGN_OUT_SCOPES = void 0;
    exports.SIGN_OUT_SCOPES = ["global", "local", "others"];
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js
var require_GoTrueAdminApi = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var fetch_1 = require_fetch2();
    var helpers_1 = require_helpers2();
    var types_1 = require_types2();
    var errors_1 = require_errors();
    var GoTrueAdminApi2 = class {
      /**
       * Creates an admin API client that can be used to manage users and OAuth clients.
       *
       * @example
       * ```ts
       * import { GoTrueAdminApi } from '@supabase/auth-js'
       *
       * const admin = new GoTrueAdminApi({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
       * })
       * ```
       */
      constructor({ url = "", headers = {}, fetch: fetch2 }) {
        this.url = url;
        this.headers = headers;
        this.fetch = (0, helpers_1.resolveFetch)(fetch2);
        this.mfa = {
          listFactors: this._listFactors.bind(this),
          deleteFactor: this._deleteFactor.bind(this)
        };
        this.oauth = {
          listClients: this._listOAuthClients.bind(this),
          createClient: this._createOAuthClient.bind(this),
          getClient: this._getOAuthClient.bind(this),
          updateClient: this._updateOAuthClient.bind(this),
          deleteClient: this._deleteOAuthClient.bind(this),
          regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this)
        };
      }
      /**
       * Removes a logged-in session.
       * @param jwt A valid, logged-in JWT.
       * @param scope The logout sope.
       */
      async signOut(jwt, scope = types_1.SIGN_OUT_SCOPES[0]) {
        if (types_1.SIGN_OUT_SCOPES.indexOf(scope) < 0) {
          throw new Error(`@supabase/auth-js: Parameter scope must be one of ${types_1.SIGN_OUT_SCOPES.join(", ")}`);
        }
        try {
          await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/logout?scope=${scope}`, {
            headers: this.headers,
            jwt,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Sends an invite link to an email address.
       * @param email The email address of the user.
       * @param options Additional options to be included when inviting.
       */
      async inviteUserByEmail(email, options = {}) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/invite`, {
            body: { email, data: options.data },
            headers: this.headers,
            redirectTo: options.redirectTo,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Generates email links and OTPs to be sent via a custom email provider.
       * @param email The user's email.
       * @param options.password User password. For signup only.
       * @param options.data Optional user metadata. For signup only.
       * @param options.redirectTo The redirect url which should be appended to the generated link
       */
      async generateLink(params) {
        try {
          const { options } = params, rest = tslib_1.__rest(params, ["options"]);
          const body = Object.assign(Object.assign({}, rest), options);
          if ("newEmail" in rest) {
            body.new_email = rest === null || rest === void 0 ? void 0 : rest.newEmail;
            delete body["newEmail"];
          }
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/generate_link`, {
            body,
            headers: this.headers,
            xform: fetch_1._generateLinkResponse,
            redirectTo: options === null || options === void 0 ? void 0 : options.redirectTo
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return {
              data: {
                properties: null,
                user: null
              },
              error
            };
          }
          throw error;
        }
      }
      // User Admin API
      /**
       * Creates a new user.
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async createUser(attributes) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/users`, {
            body: attributes,
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Get a list of users.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
       */
      async listUsers(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: fetch_1._noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const users = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, users), pagination), error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { users: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Get user by id.
       *
       * @param uid The user's unique identifier
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async getUserById(uid) {
        (0, helpers_1.validateUUID)(uid);
        try {
          return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users/${uid}`, {
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Updates the user data. Changes are applied directly without confirmation flows.
       *
       * @param attributes The data you want to update.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async updateUserById(uid, attributes) {
        (0, helpers_1.validateUUID)(uid);
        try {
          return await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/admin/users/${uid}`, {
            body: attributes,
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Delete a user. Requires a `service_role` key.
       *
       * @param id The user id you want to remove.
       * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
       * Defaults to false for backward compatibility.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async deleteUser(id, shouldSoftDelete = false) {
        (0, helpers_1.validateUUID)(id);
        try {
          return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/users/${id}`, {
            headers: this.headers,
            body: {
              should_soft_delete: shouldSoftDelete
            },
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      async _listFactors(params) {
        (0, helpers_1.validateUUID)(params.userId);
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users/${params.userId}/factors`, {
            headers: this.headers,
            xform: (factors) => {
              return { data: { factors }, error: null };
            }
          });
          return { data, error };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      async _deleteFactor(params) {
        (0, helpers_1.validateUUID)(params.userId);
        (0, helpers_1.validateUUID)(params.id);
        try {
          const data = await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/users/${params.userId}/factors/${params.id}`, {
            headers: this.headers
          });
          return { data, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth clients with optional pagination.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _listOAuthClients(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/oauth/clients`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: fetch_1._noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const clients = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, clients), pagination), error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { clients: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Creates a new OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _createOAuthClient(params) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/oauth/clients`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Gets details of a specific OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _getOAuthClient(clientId) {
        try {
          return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Updates an existing OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _updateOAuthClient(clientId, params) {
        try {
          return await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${clientId}`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Deletes an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _deleteOAuthClient(clientId) {
        try {
          await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Regenerates the secret for an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _regenerateOAuthClientSecret(clientId) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/oauth/clients/${clientId}/regenerate_secret`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
    };
    exports.default = GoTrueAdminApi2;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/local-storage.js
var require_local_storage = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/local-storage.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.memoryLocalStorageAdapter = memoryLocalStorageAdapter;
    function memoryLocalStorageAdapter(store2 = {}) {
      return {
        getItem: (key) => {
          return store2[key] || null;
        },
        setItem: (key, value) => {
          store2[key] = value;
        },
        removeItem: (key) => {
          delete store2[key];
        }
      };
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/locks.js
var require_locks = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/locks.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ProcessLockAcquireTimeoutError = exports.NavigatorLockAcquireTimeoutError = exports.LockAcquireTimeoutError = exports.internals = void 0;
    exports.navigatorLock = navigatorLock2;
    exports.processLock = processLock2;
    var helpers_1 = require_helpers2();
    exports.internals = {
      /**
       * @experimental
       */
      debug: !!(globalThis && (0, helpers_1.supportsLocalStorage)() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true")
    };
    var LockAcquireTimeoutError = class extends Error {
      constructor(message) {
        super(message);
        this.isAcquireTimeout = true;
      }
    };
    exports.LockAcquireTimeoutError = LockAcquireTimeoutError;
    var NavigatorLockAcquireTimeoutError2 = class extends LockAcquireTimeoutError {
    };
    exports.NavigatorLockAcquireTimeoutError = NavigatorLockAcquireTimeoutError2;
    var ProcessLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
    };
    exports.ProcessLockAcquireTimeoutError = ProcessLockAcquireTimeoutError;
    async function navigatorLock2(name, acquireTimeout, fn) {
      if (exports.internals.debug) {
        console.log("@supabase/gotrue-js: navigatorLock: acquire lock", name, acquireTimeout);
      }
      const abortController = new globalThis.AbortController();
      if (acquireTimeout > 0) {
        setTimeout(() => {
          abortController.abort();
          if (exports.internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock acquire timed out", name);
          }
        }, acquireTimeout);
      }
      return await Promise.resolve().then(() => globalThis.navigator.locks.request(name, acquireTimeout === 0 ? {
        mode: "exclusive",
        ifAvailable: true
      } : {
        mode: "exclusive",
        signal: abortController.signal
      }, async (lock) => {
        if (lock) {
          if (exports.internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: acquired", name, lock.name);
          }
          try {
            return await fn();
          } finally {
            if (exports.internals.debug) {
              console.log("@supabase/gotrue-js: navigatorLock: released", name, lock.name);
            }
          }
        } else {
          if (acquireTimeout === 0) {
            if (exports.internals.debug) {
              console.log("@supabase/gotrue-js: navigatorLock: not immediately available", name);
            }
            throw new NavigatorLockAcquireTimeoutError2(`Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`);
          } else {
            if (exports.internals.debug) {
              try {
                const result = await globalThis.navigator.locks.query();
                console.log("@supabase/gotrue-js: Navigator LockManager state", JSON.stringify(result, null, "  "));
              } catch (e) {
                console.warn("@supabase/gotrue-js: Error when querying Navigator LockManager state", e);
              }
            }
            console.warn("@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request");
            return await fn();
          }
        }
      }));
    }
    var PROCESS_LOCKS = {};
    async function processLock2(name, acquireTimeout, fn) {
      var _a;
      const previousOperation = (_a = PROCESS_LOCKS[name]) !== null && _a !== void 0 ? _a : Promise.resolve();
      const currentOperation = Promise.race([
        previousOperation.catch(() => {
          return null;
        }),
        acquireTimeout >= 0 ? new Promise((_, reject) => {
          setTimeout(() => {
            console.warn(`@supabase/gotrue-js: Lock "${name}" acquisition timed out after ${acquireTimeout}ms. This may be caused by another operation holding the lock. Consider increasing lockAcquireTimeout or checking for stuck operations.`);
            reject(new ProcessLockAcquireTimeoutError(`Acquiring process lock with name "${name}" timed out`));
          }, acquireTimeout);
        }) : null
      ].filter((x) => x)).catch((e) => {
        if (e && e.isAcquireTimeout) {
          throw e;
        }
        return null;
      }).then(async () => {
        return await fn();
      });
      PROCESS_LOCKS[name] = currentOperation.catch(async (e) => {
        if (e && e.isAcquireTimeout) {
          await previousOperation;
          return null;
        }
        throw e;
      });
      return await currentOperation;
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/polyfills.js
var require_polyfills = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/polyfills.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.polyfillGlobalThis = polyfillGlobalThis;
    function polyfillGlobalThis() {
      if (typeof globalThis === "object")
        return;
      try {
        Object.defineProperty(Object.prototype, "__magic__", {
          get: function() {
            return this;
          },
          configurable: true
        });
        __magic__.globalThis = __magic__;
        delete Object.prototype.__magic__;
      } catch (e) {
        if (typeof self !== "undefined") {
          self.globalThis = self;
        }
      }
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/web3/ethereum.js
var require_ethereum = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/web3/ethereum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAddress = getAddress;
    exports.fromHex = fromHex;
    exports.toHex = toHex;
    exports.createSiweMessage = createSiweMessage;
    function getAddress(address) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`@supabase/auth-js: Address "${address}" is invalid.`);
      }
      return address.toLowerCase();
    }
    function fromHex(hex) {
      return parseInt(hex, 16);
    }
    function toHex(value) {
      const bytes = new TextEncoder().encode(value);
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return "0x" + hex;
    }
    function createSiweMessage(parameters) {
      var _a;
      const { chainId, domain, expirationTime, issuedAt = /* @__PURE__ */ new Date(), nonce, notBefore, requestId, resources, scheme, uri, version } = parameters;
      {
        if (!Number.isInteger(chainId))
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${chainId}`);
        if (!domain)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.`);
        if (nonce && nonce.length < 8)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${nonce}`);
        if (!uri)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.`);
        if (version !== "1")
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${version}`);
        if ((_a = parameters.statement) === null || _a === void 0 ? void 0 : _a.includes("\n"))
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${parameters.statement}`);
      }
      const address = getAddress(parameters.address);
      const origin = scheme ? `${scheme}://${domain}` : domain;
      const statement = parameters.statement ? `${parameters.statement}
` : "";
      const prefix = `${origin} wants you to sign in with your Ethereum account:
${address}

${statement}`;
      let suffix = `URI: ${uri}
Version: ${version}
Chain ID: ${chainId}${nonce ? `
Nonce: ${nonce}` : ""}
Issued At: ${issuedAt.toISOString()}`;
      if (expirationTime)
        suffix += `
Expiration Time: ${expirationTime.toISOString()}`;
      if (notBefore)
        suffix += `
Not Before: ${notBefore.toISOString()}`;
      if (requestId)
        suffix += `
Request ID: ${requestId}`;
      if (resources) {
        let content = "\nResources:";
        for (const resource of resources) {
          if (!resource || typeof resource !== "string")
            throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${resource}`);
          content += `
- ${resource}`;
        }
        suffix += content;
      }
      return `${prefix}
${suffix}`;
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/webauthn.errors.js
var require_webauthn_errors = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/webauthn.errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebAuthnUnknownError = exports.WebAuthnError = void 0;
    exports.isWebAuthnError = isWebAuthnError;
    exports.identifyRegistrationError = identifyRegistrationError;
    exports.identifyAuthenticationError = identifyAuthenticationError;
    var webauthn_1 = require_webauthn();
    var WebAuthnError = class extends Error {
      constructor({ message, code, cause, name }) {
        var _a;
        super(message, { cause });
        this.__isWebAuthnError = true;
        this.name = (_a = name !== null && name !== void 0 ? name : cause instanceof Error ? cause.name : void 0) !== null && _a !== void 0 ? _a : "Unknown Error";
        this.code = code;
      }
    };
    exports.WebAuthnError = WebAuthnError;
    var WebAuthnUnknownError = class extends WebAuthnError {
      constructor(message, originalError) {
        super({
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: originalError,
          message
        });
        this.name = "WebAuthnUnknownError";
        this.originalError = originalError;
      }
    };
    exports.WebAuthnUnknownError = WebAuthnUnknownError;
    function isWebAuthnError(error) {
      return typeof error === "object" && error !== null && "__isWebAuthnError" in error;
    }
    function identifyRegistrationError({ error, options }) {
      var _a, _b, _c;
      const { publicKey } = options;
      if (!publicKey) {
        throw Error("options was missing required publicKey property");
      }
      if (error.name === "AbortError") {
        if (options.signal instanceof AbortSignal) {
          return new WebAuthnError({
            message: "Registration ceremony was sent an abort signal",
            code: "ERROR_CEREMONY_ABORTED",
            cause: error
          });
        }
      } else if (error.name === "ConstraintError") {
        if (((_a = publicKey.authenticatorSelection) === null || _a === void 0 ? void 0 : _a.requireResidentKey) === true) {
          return new WebAuthnError({
            message: "Discoverable credentials were required but no available authenticator supported it",
            code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
            cause: error
          });
        } else if (
          // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
          options.mediation === "conditional" && ((_b = publicKey.authenticatorSelection) === null || _b === void 0 ? void 0 : _b.userVerification) === "required"
        ) {
          return new WebAuthnError({
            message: "User verification was required during automatic registration but it could not be performed",
            code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
            cause: error
          });
        } else if (((_c = publicKey.authenticatorSelection) === null || _c === void 0 ? void 0 : _c.userVerification) === "required") {
          return new WebAuthnError({
            message: "User verification was required but no available authenticator supported it",
            code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
            cause: error
          });
        }
      } else if (error.name === "InvalidStateError") {
        return new WebAuthnError({
          message: "The authenticator was previously registered",
          code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
          cause: error
        });
      } else if (error.name === "NotAllowedError") {
        return new WebAuthnError({
          message: error.message,
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: error
        });
      } else if (error.name === "NotSupportedError") {
        const validPubKeyCredParams = publicKey.pubKeyCredParams.filter((param) => param.type === "public-key");
        if (validPubKeyCredParams.length === 0) {
          return new WebAuthnError({
            message: 'No entry in pubKeyCredParams was of type "public-key"',
            code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
            cause: error
          });
        }
        return new WebAuthnError({
          message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
          code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
          cause: error
        });
      } else if (error.name === "SecurityError") {
        const effectiveDomain = window.location.hostname;
        if (!(0, webauthn_1.isValidDomain)(effectiveDomain)) {
          return new WebAuthnError({
            message: `${window.location.hostname} is an invalid domain`,
            code: "ERROR_INVALID_DOMAIN",
            cause: error
          });
        } else if (publicKey.rp.id !== effectiveDomain) {
          return new WebAuthnError({
            message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: error
          });
        }
      } else if (error.name === "TypeError") {
        if (publicKey.user.id.byteLength < 1 || publicKey.user.id.byteLength > 64) {
          return new WebAuthnError({
            message: "User ID was not between 1 and 64 characters",
            code: "ERROR_INVALID_USER_ID_LENGTH",
            cause: error
          });
        }
      } else if (error.name === "UnknownError") {
        return new WebAuthnError({
          message: "The authenticator was unable to process the specified options, or could not create a new credential",
          code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
          cause: error
        });
      }
      return new WebAuthnError({
        message: "a Non-Webauthn related error has occurred",
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: error
      });
    }
    function identifyAuthenticationError({ error, options }) {
      const { publicKey } = options;
      if (!publicKey) {
        throw Error("options was missing required publicKey property");
      }
      if (error.name === "AbortError") {
        if (options.signal instanceof AbortSignal) {
          return new WebAuthnError({
            message: "Authentication ceremony was sent an abort signal",
            code: "ERROR_CEREMONY_ABORTED",
            cause: error
          });
        }
      } else if (error.name === "NotAllowedError") {
        return new WebAuthnError({
          message: error.message,
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: error
        });
      } else if (error.name === "SecurityError") {
        const effectiveDomain = window.location.hostname;
        if (!(0, webauthn_1.isValidDomain)(effectiveDomain)) {
          return new WebAuthnError({
            message: `${window.location.hostname} is an invalid domain`,
            code: "ERROR_INVALID_DOMAIN",
            cause: error
          });
        } else if (publicKey.rpId !== effectiveDomain) {
          return new WebAuthnError({
            message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: error
          });
        }
      } else if (error.name === "UnknownError") {
        return new WebAuthnError({
          message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
          code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
          cause: error
        });
      }
      return new WebAuthnError({
        message: "a Non-Webauthn related error has occurred",
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: error
      });
    }
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/webauthn.js
var require_webauthn = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/lib/webauthn.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebAuthnApi = exports.DEFAULT_REQUEST_OPTIONS = exports.DEFAULT_CREATION_OPTIONS = exports.webAuthnAbortService = exports.WebAuthnAbortService = exports.identifyAuthenticationError = exports.identifyRegistrationError = exports.isWebAuthnError = exports.WebAuthnError = void 0;
    exports.deserializeCredentialCreationOptions = deserializeCredentialCreationOptions;
    exports.deserializeCredentialRequestOptions = deserializeCredentialRequestOptions;
    exports.serializeCredentialCreationResponse = serializeCredentialCreationResponse;
    exports.serializeCredentialRequestResponse = serializeCredentialRequestResponse;
    exports.isValidDomain = isValidDomain;
    exports.createCredential = createCredential;
    exports.getCredential = getCredential;
    exports.mergeCredentialCreationOptions = mergeCredentialCreationOptions;
    exports.mergeCredentialRequestOptions = mergeCredentialRequestOptions;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var base64url_1 = require_base64url();
    var errors_1 = require_errors();
    var helpers_1 = require_helpers2();
    var webauthn_errors_1 = require_webauthn_errors();
    Object.defineProperty(exports, "identifyAuthenticationError", { enumerable: true, get: function() {
      return webauthn_errors_1.identifyAuthenticationError;
    } });
    Object.defineProperty(exports, "identifyRegistrationError", { enumerable: true, get: function() {
      return webauthn_errors_1.identifyRegistrationError;
    } });
    Object.defineProperty(exports, "isWebAuthnError", { enumerable: true, get: function() {
      return webauthn_errors_1.isWebAuthnError;
    } });
    Object.defineProperty(exports, "WebAuthnError", { enumerable: true, get: function() {
      return webauthn_errors_1.WebAuthnError;
    } });
    var WebAuthnAbortService = class {
      /**
       * Create an abort signal for a new WebAuthn operation.
       * Automatically cancels any existing operation.
       *
       * @returns {AbortSignal} Signal to pass to navigator.credentials.create() or .get()
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal MDN - AbortSignal}
       */
      createNewAbortSignal() {
        if (this.controller) {
          const abortError = new Error("Cancelling existing WebAuthn API call for new one");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
        }
        const newController = new AbortController();
        this.controller = newController;
        return newController.signal;
      }
      /**
       * Manually cancel the current WebAuthn operation.
       * Useful for cleaning up when user cancels or navigates away.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort MDN - AbortController.abort}
       */
      cancelCeremony() {
        if (this.controller) {
          const abortError = new Error("Manually cancelling existing WebAuthn API call");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
          this.controller = void 0;
        }
      }
    };
    exports.WebAuthnAbortService = WebAuthnAbortService;
    exports.webAuthnAbortService = new WebAuthnAbortService();
    function deserializeCredentialCreationOptions(options) {
      if (!options) {
        throw new Error("Credential creation options are required");
      }
      if (typeof PublicKeyCredential !== "undefined" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function") {
        return PublicKeyCredential.parseCreationOptionsFromJSON(
          /** we assert the options here as typescript still doesn't know about future webauthn types */
          options
        );
      }
      const { challenge: challengeStr, user: userOpts, excludeCredentials } = options, restOptions = tslib_1.__rest(
        options,
        ["challenge", "user", "excludeCredentials"]
      );
      const challenge = (0, base64url_1.base64UrlToUint8Array)(challengeStr).buffer;
      const user = Object.assign(Object.assign({}, userOpts), { id: (0, base64url_1.base64UrlToUint8Array)(userOpts.id).buffer });
      const result = Object.assign(Object.assign({}, restOptions), {
        challenge,
        user
      });
      if (excludeCredentials && excludeCredentials.length > 0) {
        result.excludeCredentials = new Array(excludeCredentials.length);
        for (let i = 0; i < excludeCredentials.length; i++) {
          const cred = excludeCredentials[i];
          result.excludeCredentials[i] = Object.assign(Object.assign({}, cred), {
            id: (0, base64url_1.base64UrlToUint8Array)(cred.id).buffer,
            type: cred.type || "public-key",
            // Cast transports to handle future transport types like "cable"
            transports: cred.transports
          });
        }
      }
      return result;
    }
    function deserializeCredentialRequestOptions(options) {
      if (!options) {
        throw new Error("Credential request options are required");
      }
      if (typeof PublicKeyCredential !== "undefined" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function") {
        return PublicKeyCredential.parseRequestOptionsFromJSON(options);
      }
      const { challenge: challengeStr, allowCredentials } = options, restOptions = tslib_1.__rest(
        options,
        ["challenge", "allowCredentials"]
      );
      const challenge = (0, base64url_1.base64UrlToUint8Array)(challengeStr).buffer;
      const result = Object.assign(Object.assign({}, restOptions), { challenge });
      if (allowCredentials && allowCredentials.length > 0) {
        result.allowCredentials = new Array(allowCredentials.length);
        for (let i = 0; i < allowCredentials.length; i++) {
          const cred = allowCredentials[i];
          result.allowCredentials[i] = Object.assign(Object.assign({}, cred), {
            id: (0, base64url_1.base64UrlToUint8Array)(cred.id).buffer,
            type: cred.type || "public-key",
            // Cast transports to handle future transport types like "cable"
            transports: cred.transports
          });
        }
      }
      return result;
    }
    function serializeCredentialCreationResponse(credential) {
      var _a;
      if ("toJSON" in credential && typeof credential.toJSON === "function") {
        return credential.toJSON();
      }
      const credentialWithAttachment = credential;
      return {
        id: credential.id,
        rawId: credential.id,
        response: {
          attestationObject: (0, base64url_1.bytesToBase64URL)(new Uint8Array(credential.response.attestationObject)),
          clientDataJSON: (0, base64url_1.bytesToBase64URL)(new Uint8Array(credential.response.clientDataJSON))
        },
        type: "public-key",
        clientExtensionResults: credential.getClientExtensionResults(),
        // Convert null to undefined and cast to AuthenticatorAttachment type
        authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
      };
    }
    function serializeCredentialRequestResponse(credential) {
      var _a;
      if ("toJSON" in credential && typeof credential.toJSON === "function") {
        return credential.toJSON();
      }
      const credentialWithAttachment = credential;
      const clientExtensionResults = credential.getClientExtensionResults();
      const assertionResponse = credential.response;
      return {
        id: credential.id,
        rawId: credential.id,
        // W3C spec expects rawId to match id for JSON format
        response: {
          authenticatorData: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.authenticatorData)),
          clientDataJSON: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.clientDataJSON)),
          signature: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.signature)),
          userHandle: assertionResponse.userHandle ? (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.userHandle)) : void 0
        },
        type: "public-key",
        clientExtensionResults,
        // Convert null to undefined and cast to AuthenticatorAttachment type
        authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
      };
    }
    function isValidDomain(hostname) {
      return (
        // Consider localhost valid as well since it's okay wrt Secure Contexts
        hostname === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(hostname)
      );
    }
    function browserSupportsWebAuthn() {
      var _a, _b;
      return !!((0, helpers_1.isBrowser)() && "PublicKeyCredential" in window && window.PublicKeyCredential && "credentials" in navigator && typeof ((_a = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _a === void 0 ? void 0 : _a.create) === "function" && typeof ((_b = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _b === void 0 ? void 0 : _b.get) === "function");
    }
    async function createCredential(options) {
      try {
        const response = await navigator.credentials.create(
          /** we assert the type here until typescript types are updated */
          options
        );
        if (!response) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Empty credential response", response)
          };
        }
        if (!(response instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Browser returned unexpected credential type", response)
          };
        }
        return { data: response, error: null };
      } catch (err) {
        return {
          data: null,
          error: (0, webauthn_errors_1.identifyRegistrationError)({
            error: err,
            options
          })
        };
      }
    }
    async function getCredential(options) {
      try {
        const response = await navigator.credentials.get(
          /** we assert the type here until typescript types are updated */
          options
        );
        if (!response) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Empty credential response", response)
          };
        }
        if (!(response instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Browser returned unexpected credential type", response)
          };
        }
        return { data: response, error: null };
      } catch (err) {
        return {
          data: null,
          error: (0, webauthn_errors_1.identifyAuthenticationError)({
            error: err,
            options
          })
        };
      }
    }
    exports.DEFAULT_CREATION_OPTIONS = {
      hints: ["security-key"],
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        requireResidentKey: false,
        /** set to preferred because older yubikeys don't have PIN/Biometric */
        userVerification: "preferred",
        residentKey: "discouraged"
      },
      attestation: "direct"
    };
    exports.DEFAULT_REQUEST_OPTIONS = {
      /** set to preferred because older yubikeys don't have PIN/Biometric */
      userVerification: "preferred",
      hints: ["security-key"],
      attestation: "direct"
    };
    function deepMerge2(...sources) {
      const isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
      const isArrayBufferLike = (val) => val instanceof ArrayBuffer || ArrayBuffer.isView(val);
      const result = {};
      for (const source of sources) {
        if (!source)
          continue;
        for (const key in source) {
          const value = source[key];
          if (value === void 0)
            continue;
          if (Array.isArray(value)) {
            result[key] = value;
          } else if (isArrayBufferLike(value)) {
            result[key] = value;
          } else if (isObject(value)) {
            const existing = result[key];
            if (isObject(existing)) {
              result[key] = deepMerge2(existing, value);
            } else {
              result[key] = deepMerge2(value);
            }
          } else {
            result[key] = value;
          }
        }
      }
      return result;
    }
    function mergeCredentialCreationOptions(baseOptions, overrides) {
      return deepMerge2(exports.DEFAULT_CREATION_OPTIONS, baseOptions, overrides || {});
    }
    function mergeCredentialRequestOptions(baseOptions, overrides) {
      return deepMerge2(exports.DEFAULT_REQUEST_OPTIONS, baseOptions, overrides || {});
    }
    var WebAuthnApi = class {
      constructor(client) {
        this.client = client;
        this.enroll = this._enroll.bind(this);
        this.challenge = this._challenge.bind(this);
        this.verify = this._verify.bind(this);
        this.authenticate = this._authenticate.bind(this);
        this.register = this._register.bind(this);
      }
      /**
       * Enroll a new WebAuthn factor.
       * Creates an unverified WebAuthn factor that must be verified with a credential.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Omit<MFAEnrollWebauthnParams, 'factorType'>} params - Enrollment parameters (friendlyName required)
       * @returns {Promise<AuthMFAEnrollWebauthnResponse>} Enrolled factor details or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registering a New Credential}
       */
      async _enroll(params) {
        return this.client.mfa.enroll(Object.assign(Object.assign({}, params), { factorType: "webauthn" }));
      }
      /**
       * Challenge for WebAuthn credential creation or authentication.
       * Combines server challenge with browser credential operations.
       * Handles both registration (create) and authentication (request) flows.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {MFAChallengeWebauthnParams & { friendlyName?: string; signal?: AbortSignal }} params - Challenge parameters including factorId
       * @param {Object} overrides - Allows you to override the parameters passed to navigator.credentials
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides.create - Override options for credential creation
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides.request - Override options for credential request
       * @returns {Promise<RequestResult>} Challenge response with credential or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-credential-creation W3C WebAuthn Spec - Credential Creation}
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying Assertion}
       */
      async _challenge({ factorId, webauthn, friendlyName, signal }, overrides) {
        try {
          const { data: challengeResponse, error: challengeError } = await this.client.mfa.challenge({
            factorId,
            webauthn
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const abortSignal = signal !== null && signal !== void 0 ? signal : exports.webAuthnAbortService.createNewAbortSignal();
          if (challengeResponse.webauthn.type === "create") {
            const { user } = challengeResponse.webauthn.credential_options.publicKey;
            if (!user.name) {
              user.name = `${user.id}:${friendlyName}`;
            }
            if (!user.displayName) {
              user.displayName = user.name;
            }
          }
          switch (challengeResponse.webauthn.type) {
            case "create": {
              const options = mergeCredentialCreationOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.create);
              const { data, error } = await createCredential({
                publicKey: options,
                signal: abortSignal
              });
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
            case "request": {
              const options = mergeCredentialRequestOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.request);
              const { data, error } = await getCredential(Object.assign(Object.assign({}, challengeResponse.webauthn.credential_options), { publicKey: options, signal: abortSignal }));
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
          }
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in challenge", error)
          };
        }
      }
      /**
       * Verify a WebAuthn credential with the server.
       * Completes the WebAuthn ceremony by sending the credential to the server for verification.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Verification parameters
       * @param {string} params.challengeId - ID of the challenge being verified
       * @param {string} params.factorId - ID of the WebAuthn factor
       * @param {MFAVerifyWebauthnParams<T>['webauthn']} params.webauthn - WebAuthn credential response
       * @returns {Promise<AuthMFAVerifyResponse>} Verification result with session or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying an Authentication Assertion}
       * */
      async _verify({ challengeId, factorId, webauthn }) {
        return this.client.mfa.verify({
          factorId,
          challengeId,
          webauthn
        });
      }
      /**
       * Complete WebAuthn authentication flow.
       * Performs challenge and verification in a single operation for existing credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Authentication parameters
       * @param {string} params.factorId - ID of the WebAuthn factor to authenticate with
       * @param {Object} params.webauthn - WebAuthn configuration
       * @param {string} params.webauthn.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.webauthn.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.webauthn.signal - Optional abort signal
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides - Override options for navigator.credentials.get
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Authentication result
       * @see {@link https://w3c.github.io/webauthn/#sctn-authentication W3C WebAuthn Spec - Authentication Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions MDN - PublicKeyCredentialRequestOptions}
       */
      async _authenticate({ factorId, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new errors_1.AuthError("rpId is required for WebAuthn authentication")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new errors_1.AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: challengeResponse, error: challengeError } = await this.challenge({
            factorId,
            webauthn: { rpId, rpOrigins },
            signal
          }, { request: overrides });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const { webauthn } = challengeResponse;
          return this._verify({
            factorId,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              type: webauthn.type,
              rpId,
              rpOrigins,
              credential_response: webauthn.credential_response
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in authenticate", error)
          };
        }
      }
      /**
       * Complete WebAuthn registration flow.
       * Performs enrollment, challenge, and verification in a single operation for new credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Registration parameters
       * @param {string} params.friendlyName - User-friendly name for the credential
       * @param {string} params.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.signal - Optional abort signal
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides - Override options for navigator.credentials.create
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Registration result
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registration Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions MDN - PublicKeyCredentialCreationOptions}
       */
      async _register({ friendlyName, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new errors_1.AuthError("rpId is required for WebAuthn registration")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new errors_1.AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: factor, error: enrollError } = await this._enroll({
            friendlyName
          });
          if (!factor) {
            await this.client.mfa.listFactors().then((factors) => {
              var _a;
              return (_a = factors.data) === null || _a === void 0 ? void 0 : _a.all.find((v) => v.factor_type === "webauthn" && v.friendly_name === friendlyName && v.status !== "unverified");
            }).then((factor2) => factor2 ? this.client.mfa.unenroll({ factorId: factor2 === null || factor2 === void 0 ? void 0 : factor2.id }) : void 0);
            return { data: null, error: enrollError };
          }
          const { data: challengeResponse, error: challengeError } = await this._challenge({
            factorId: factor.id,
            friendlyName: factor.friendly_name,
            webauthn: { rpId, rpOrigins },
            signal
          }, {
            create: overrides
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          return this._verify({
            factorId: factor.id,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              rpId,
              rpOrigins,
              type: challengeResponse.webauthn.type,
              credential_response: challengeResponse.webauthn.credential_response
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in register", error)
          };
        }
      }
    };
    exports.WebAuthnApi = WebAuthnApi;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js
var require_GoTrueClient = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    var constants_1 = require_constants3();
    var errors_1 = require_errors();
    var fetch_1 = require_fetch2();
    var helpers_1 = require_helpers2();
    var local_storage_1 = require_local_storage();
    var locks_1 = require_locks();
    var polyfills_1 = require_polyfills();
    var version_1 = require_version3();
    var base64url_1 = require_base64url();
    var ethereum_1 = require_ethereum();
    var webauthn_1 = require_webauthn();
    (0, polyfills_1.polyfillGlobalThis)();
    var DEFAULT_OPTIONS = {
      url: constants_1.GOTRUE_URL,
      storageKey: constants_1.STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      headers: constants_1.DEFAULT_HEADERS,
      flowType: "implicit",
      debug: false,
      hasCustomAuthorizationHeader: false,
      throwOnError: false,
      lockAcquireTimeout: 1e4
      // 10 seconds
    };
    async function lockNoOp(name, acquireTimeout, fn) {
      return await fn();
    }
    var GLOBAL_JWKS = {};
    var GoTrueClient2 = class _GoTrueClient {
      /**
       * The JWKS used for verifying asymmetric JWTs
       */
      get jwks() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.jwks) !== null && _b !== void 0 ? _b : { keys: [] };
      }
      set jwks(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { jwks: value });
      }
      get jwks_cached_at() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.cachedAt) !== null && _b !== void 0 ? _b : Number.MIN_SAFE_INTEGER;
      }
      set jwks_cached_at(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { cachedAt: value });
      }
      /**
       * Create a new client for use in the browser.
       *
       * @example
       * ```ts
       * import { GoTrueClient } from '@supabase/auth-js'
       *
       * const auth = new GoTrueClient({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { apikey: 'public-anon-key' },
       *   storageKey: 'supabase-auth',
       * })
       * ```
       */
      constructor(options) {
        var _a, _b, _c;
        this.userStorage = null;
        this.memoryStorage = null;
        this.stateChangeEmitters = /* @__PURE__ */ new Map();
        this.autoRefreshTicker = null;
        this.autoRefreshTickTimeout = null;
        this.visibilityChangedCallback = null;
        this.refreshingDeferred = null;
        this.initializePromise = null;
        this.detectSessionInUrl = true;
        this.hasCustomAuthorizationHeader = false;
        this.suppressGetSessionWarning = false;
        this.lockAcquired = false;
        this.pendingInLock = [];
        this.broadcastChannel = null;
        this.logger = console.log;
        const settings = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        this.storageKey = settings.storageKey;
        this.instanceID = (_a = _GoTrueClient.nextInstanceID[this.storageKey]) !== null && _a !== void 0 ? _a : 0;
        _GoTrueClient.nextInstanceID[this.storageKey] = this.instanceID + 1;
        this.logDebugMessages = !!settings.debug;
        if (typeof settings.debug === "function") {
          this.logger = settings.debug;
        }
        if (this.instanceID > 0 && (0, helpers_1.isBrowser)()) {
          const message = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
          console.warn(message);
          if (this.logDebugMessages) {
            console.trace(message);
          }
        }
        this.persistSession = settings.persistSession;
        this.autoRefreshToken = settings.autoRefreshToken;
        this.admin = new GoTrueAdminApi_1.default({
          url: settings.url,
          headers: settings.headers,
          fetch: settings.fetch
        });
        this.url = settings.url;
        this.headers = settings.headers;
        this.fetch = (0, helpers_1.resolveFetch)(settings.fetch);
        this.lock = settings.lock || lockNoOp;
        this.detectSessionInUrl = settings.detectSessionInUrl;
        this.flowType = settings.flowType;
        this.hasCustomAuthorizationHeader = settings.hasCustomAuthorizationHeader;
        this.throwOnError = settings.throwOnError;
        this.lockAcquireTimeout = settings.lockAcquireTimeout;
        if (settings.lock) {
          this.lock = settings.lock;
        } else if (this.persistSession && (0, helpers_1.isBrowser)() && ((_b = globalThis === null || globalThis === void 0 ? void 0 : globalThis.navigator) === null || _b === void 0 ? void 0 : _b.locks)) {
          this.lock = locks_1.navigatorLock;
        } else {
          this.lock = lockNoOp;
        }
        if (!this.jwks) {
          this.jwks = { keys: [] };
          this.jwks_cached_at = Number.MIN_SAFE_INTEGER;
        }
        this.mfa = {
          verify: this._verify.bind(this),
          enroll: this._enroll.bind(this),
          unenroll: this._unenroll.bind(this),
          challenge: this._challenge.bind(this),
          listFactors: this._listFactors.bind(this),
          challengeAndVerify: this._challengeAndVerify.bind(this),
          getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
          webauthn: new webauthn_1.WebAuthnApi(this)
        };
        this.oauth = {
          getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
          approveAuthorization: this._approveAuthorization.bind(this),
          denyAuthorization: this._denyAuthorization.bind(this),
          listGrants: this._listOAuthGrants.bind(this),
          revokeGrant: this._revokeOAuthGrant.bind(this)
        };
        if (this.persistSession) {
          if (settings.storage) {
            this.storage = settings.storage;
          } else {
            if ((0, helpers_1.supportsLocalStorage)()) {
              this.storage = globalThis.localStorage;
            } else {
              this.memoryStorage = {};
              this.storage = (0, local_storage_1.memoryLocalStorageAdapter)(this.memoryStorage);
            }
          }
          if (settings.userStorage) {
            this.userStorage = settings.userStorage;
          }
        } else {
          this.memoryStorage = {};
          this.storage = (0, local_storage_1.memoryLocalStorageAdapter)(this.memoryStorage);
        }
        if ((0, helpers_1.isBrowser)() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
          try {
            this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
          } catch (e) {
            console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", e);
          }
          (_c = this.broadcastChannel) === null || _c === void 0 ? void 0 : _c.addEventListener("message", async (event) => {
            this._debug("received broadcast notification from other tab or client", event);
            await this._notifyAllSubscribers(event.data.event, event.data.session, false);
          });
        }
        this.initialize();
      }
      /**
       * Returns whether error throwing mode is enabled for this client.
       */
      isThrowOnErrorEnabled() {
        return this.throwOnError;
      }
      /**
       * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
       * and the provided result contains a non-nullish error, the error is thrown instead of
       * being returned. This ensures consistent behavior across all public API methods.
       */
      _returnResult(result) {
        if (this.throwOnError && result && result.error) {
          throw result.error;
        }
        return result;
      }
      _logPrefix() {
        return `GoTrueClient@${this.storageKey}:${this.instanceID} (${version_1.version}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
      }
      _debug(...args) {
        if (this.logDebugMessages) {
          this.logger(this._logPrefix(), ...args);
        }
        return this;
      }
      /**
       * Initializes the client session either from the url or from storage.
       * This method is automatically called when instantiating the client, but should also be called
       * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
       */
      async initialize() {
        if (this.initializePromise) {
          return await this.initializePromise;
        }
        this.initializePromise = (async () => {
          return await this._acquireLock(this.lockAcquireTimeout, async () => {
            return await this._initialize();
          });
        })();
        return await this.initializePromise;
      }
      /**
       * IMPORTANT:
       * 1. Never throw in this method, as it is called from the constructor
       * 2. Never return a session from this method as it would be cached over
       *    the whole lifetime of the client
       */
      async _initialize() {
        var _a;
        try {
          let params = {};
          let callbackUrlType = "none";
          if ((0, helpers_1.isBrowser)()) {
            params = (0, helpers_1.parseParametersFromURL)(window.location.href);
            if (this._isImplicitGrantCallback(params)) {
              callbackUrlType = "implicit";
            } else if (await this._isPKCECallback(params)) {
              callbackUrlType = "pkce";
            }
          }
          if ((0, helpers_1.isBrowser)() && this.detectSessionInUrl && callbackUrlType !== "none") {
            const { data, error } = await this._getSessionFromURL(params, callbackUrlType);
            if (error) {
              this._debug("#_initialize()", "error detecting session from URL", error);
              if ((0, errors_1.isAuthImplicitGrantRedirectError)(error)) {
                const errorCode = (_a = error.details) === null || _a === void 0 ? void 0 : _a.code;
                if (errorCode === "identity_already_exists" || errorCode === "identity_not_found" || errorCode === "single_identity_not_deletable") {
                  return { error };
                }
              }
              return { error };
            }
            const { session, redirectType } = data;
            this._debug("#_initialize()", "detected session in URL", session, "redirect type", redirectType);
            await this._saveSession(session);
            setTimeout(async () => {
              if (redirectType === "recovery") {
                await this._notifyAllSubscribers("PASSWORD_RECOVERY", session);
              } else {
                await this._notifyAllSubscribers("SIGNED_IN", session);
              }
            }, 0);
            return { error: null };
          }
          await this._recoverAndRefresh();
          return { error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ error });
          }
          return this._returnResult({
            error: new errors_1.AuthUnknownError("Unexpected error during initialization", error)
          });
        } finally {
          await this._handleVisibilityChange();
          this._debug("#_initialize()", "end");
        }
      }
      /**
       * Creates a new anonymous user.
       *
       * @returns A session where the is_anonymous claim in the access token JWT set to true
       */
      async signInAnonymously(credentials) {
        var _a, _b, _c;
        try {
          const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
            headers: this.headers,
            body: {
              data: (_b = (_a = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : {},
              gotrue_meta_security: { captcha_token: (_c = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _c === void 0 ? void 0 : _c.captchaToken }
            },
            xform: fetch_1._sessionResponse
          });
          const { data, error } = res;
          if (error || !data) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Creates a new user.
       *
       * Be aware that if a user account exists in the system you may get back an
       * error message that attempts to hide this information from the user.
       * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
       *
       * @returns A logged-in session if the server has "autoconfirm" ON
       * @returns A user if the server has "autoconfirm" OFF
       */
      async signUp(credentials) {
        var _a, _b, _c;
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: {
                email,
                password,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              xform: fetch_1._sessionResponse
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              body: {
                phone,
                password,
                data: (_b = options === null || options === void 0 ? void 0 : options.data) !== null && _b !== void 0 ? _b : {},
                channel: (_c = options === null || options === void 0 ? void 0 : options.channel) !== null && _c !== void 0 ? _c : "sms",
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponse
            });
          } else {
            throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error || !data) {
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user with an email and password or phone and password.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or that the
       * email/phone and password combination is wrong or that the account can only
       * be accessed via social login.
       */
      async signInWithPassword(credentials) {
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                email,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponsePassword
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                phone,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponsePassword
            });
          } else {
            throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({
            data: Object.assign({ user: data.user, session: data.session }, data.weak_password ? { weakPassword: data.weak_password } : null),
            error
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user via a third-party provider.
       * This method supports the PKCE flow.
       */
      async signInWithOAuth(credentials) {
        var _a, _b, _c, _d;
        return await this._handleProviderSignIn(credentials.provider, {
          redirectTo: (_a = credentials.options) === null || _a === void 0 ? void 0 : _a.redirectTo,
          scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
          queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
          skipBrowserRedirect: (_d = credentials.options) === null || _d === void 0 ? void 0 : _d.skipBrowserRedirect
        });
      }
      /**
       * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
       */
      async exchangeCodeForSession(authCode) {
        await this.initializePromise;
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._exchangeCodeForSession(authCode);
        });
      }
      /**
       * Signs in a user by verifying a message signed by the user's private key.
       * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
       * both of which derive from the EIP-4361 standard
       * With slight variation on Solana's side.
       * @reference https://eips.ethereum.org/EIPS/eip-4361
       */
      async signInWithWeb3(credentials) {
        const { chain } = credentials;
        switch (chain) {
          case "ethereum":
            return await this.signInWithEthereum(credentials);
          case "solana":
            return await this.signInWithSolana(credentials);
          default:
            throw new Error(`@supabase/auth-js: Unsupported chain "${chain}"`);
        }
      }
      async signInWithEthereum(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!(0, helpers_1.isBrowser)()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("ethereum" in windowAny && typeof windowAny.ethereum === "object" && "request" in windowAny.ethereum && typeof windowAny.ethereum.request === "function") {
              resolvedWallet = windowAny.ethereum;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          const accounts = await resolvedWallet.request({
            method: "eth_requestAccounts"
          }).then((accs) => accs).catch(() => {
            throw new Error(`@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid`);
          });
          if (!accounts || accounts.length === 0) {
            throw new Error(`@supabase/auth-js: No accounts available. Please ensure the wallet is connected.`);
          }
          const address = (0, ethereum_1.getAddress)(accounts[0]);
          let chainId = (_b = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _b === void 0 ? void 0 : _b.chainId;
          if (!chainId) {
            const chainIdHex = await resolvedWallet.request({
              method: "eth_chainId"
            });
            chainId = (0, ethereum_1.fromHex)(chainIdHex);
          }
          const siweMessage = {
            domain: url.host,
            address,
            statement,
            uri: url.href,
            version: "1",
            chainId,
            nonce: (_c = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _c === void 0 ? void 0 : _c.nonce,
            issuedAt: (_e = (_d = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _d === void 0 ? void 0 : _d.issuedAt) !== null && _e !== void 0 ? _e : /* @__PURE__ */ new Date(),
            expirationTime: (_f = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _f === void 0 ? void 0 : _f.expirationTime,
            notBefore: (_g = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _g === void 0 ? void 0 : _g.notBefore,
            requestId: (_h = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _h === void 0 ? void 0 : _h.requestId,
            resources: (_j = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _j === void 0 ? void 0 : _j.resources
          };
          message = (0, ethereum_1.createSiweMessage)(siweMessage);
          signature = await resolvedWallet.request({
            method: "personal_sign",
            params: [(0, ethereum_1.toHex)(message), address]
          });
        }
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({
              chain: "ethereum",
              message,
              signature
            }, ((_k = credentials.options) === null || _k === void 0 ? void 0 : _k.captchaToken) ? { gotrue_meta_security: { captcha_token: (_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken } } : null),
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async signInWithSolana(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!(0, helpers_1.isBrowser)()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("solana" in windowAny && typeof windowAny.solana === "object" && ("signIn" in windowAny.solana && typeof windowAny.solana.signIn === "function" || "signMessage" in windowAny.solana && typeof windowAny.solana.signMessage === "function")) {
              resolvedWallet = windowAny.solana;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          if ("signIn" in resolvedWallet && resolvedWallet.signIn) {
            const output = await resolvedWallet.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, options === null || options === void 0 ? void 0 : options.signInWithSolana), {
              // non-overridable properties
              version: "1",
              domain: url.host,
              uri: url.href
            }), statement ? { statement } : null));
            let outputToProcess;
            if (Array.isArray(output) && output[0] && typeof output[0] === "object") {
              outputToProcess = output[0];
            } else if (output && typeof output === "object" && "signedMessage" in output && "signature" in output) {
              outputToProcess = output;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
            }
            if ("signedMessage" in outputToProcess && "signature" in outputToProcess && (typeof outputToProcess.signedMessage === "string" || outputToProcess.signedMessage instanceof Uint8Array) && outputToProcess.signature instanceof Uint8Array) {
              message = typeof outputToProcess.signedMessage === "string" ? outputToProcess.signedMessage : new TextDecoder().decode(outputToProcess.signedMessage);
              signature = outputToProcess.signature;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
            }
          } else {
            if (!("signMessage" in resolvedWallet) || typeof resolvedWallet.signMessage !== "function" || !("publicKey" in resolvedWallet) || typeof resolvedWallet !== "object" || !resolvedWallet.publicKey || !("toBase58" in resolvedWallet.publicKey) || typeof resolvedWallet.publicKey.toBase58 !== "function") {
              throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
            }
            message = [
              `${url.host} wants you to sign in with your Solana account:`,
              resolvedWallet.publicKey.toBase58(),
              ...statement ? ["", statement, ""] : [""],
              "Version: 1",
              `URI: ${url.href}`,
              `Issued At: ${(_c = (_b = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _b === void 0 ? void 0 : _b.issuedAt) !== null && _c !== void 0 ? _c : (/* @__PURE__ */ new Date()).toISOString()}`,
              ...((_d = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _d === void 0 ? void 0 : _d.notBefore) ? [`Not Before: ${options.signInWithSolana.notBefore}`] : [],
              ...((_e = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _e === void 0 ? void 0 : _e.expirationTime) ? [`Expiration Time: ${options.signInWithSolana.expirationTime}`] : [],
              ...((_f = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _f === void 0 ? void 0 : _f.chainId) ? [`Chain ID: ${options.signInWithSolana.chainId}`] : [],
              ...((_g = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _g === void 0 ? void 0 : _g.nonce) ? [`Nonce: ${options.signInWithSolana.nonce}`] : [],
              ...((_h = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _h === void 0 ? void 0 : _h.requestId) ? [`Request ID: ${options.signInWithSolana.requestId}`] : [],
              ...((_k = (_j = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _j === void 0 ? void 0 : _j.resources) === null || _k === void 0 ? void 0 : _k.length) ? [
                "Resources",
                ...options.signInWithSolana.resources.map((resource) => `- ${resource}`)
              ] : []
            ].join("\n");
            const maybeSignature = await resolvedWallet.signMessage(new TextEncoder().encode(message), "utf8");
            if (!maybeSignature || !(maybeSignature instanceof Uint8Array)) {
              throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
            }
            signature = maybeSignature;
          }
        }
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({ chain: "solana", message, signature: (0, base64url_1.bytesToBase64URL)(signature) }, ((_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken) ? { gotrue_meta_security: { captcha_token: (_m = credentials.options) === null || _m === void 0 ? void 0 : _m.captchaToken } } : null),
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async _exchangeCodeForSession(authCode) {
        const storageItem = await (0, helpers_1.getItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        const [codeVerifier, redirectType] = (storageItem !== null && storageItem !== void 0 ? storageItem : "").split("/");
        try {
          if (!codeVerifier && this.flowType === "pkce") {
            throw new errors_1.AuthPKCECodeVerifierMissingError();
          }
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
            headers: this.headers,
            body: {
              auth_code: authCode,
              code_verifier: codeVerifier
            },
            xform: fetch_1._sessionResponse
          });
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error: invalidTokenError
            });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign(Object.assign({}, data), { redirectType: redirectType !== null && redirectType !== void 0 ? redirectType : null }), error });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error
            });
          }
          throw error;
        }
      }
      /**
       * Allows signing in with an OIDC ID token. The authentication provider used
       * should be enabled and configured.
       */
      async signInWithIdToken(credentials) {
        try {
          const { options, provider, token, access_token, nonce } = credentials;
          const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
            headers: this.headers,
            body: {
              provider,
              id_token: token,
              access_token,
              nonce,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: fetch_1._sessionResponse
          });
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data, error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user using magiclink or a one-time password (OTP).
       *
       * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
       * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
       * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or, that the account
       * can only be accessed via social login.
       *
       * Do note that you will need to configure a Whatsapp sender on Twilio
       * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
       * channel is not supported on other providers
       * at this time.
       * This method supports PKCE when an email is passed.
       */
      async signInWithOtp(credentials) {
        var _a, _b, _c, _d, _e;
        try {
          if ("email" in credentials) {
            const { email, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            const { error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                email,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                create_user: (_b = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _b !== void 0 ? _b : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          if ("phone" in credentials) {
            const { phone, options } = credentials;
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                phone,
                data: (_c = options === null || options === void 0 ? void 0 : options.data) !== null && _c !== void 0 ? _c : {},
                create_user: (_d = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _d !== void 0 ? _d : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                channel: (_e = options === null || options === void 0 ? void 0 : options.channel) !== null && _e !== void 0 ? _e : "sms"
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number.");
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
       */
      async verifyOtp(params) {
        var _a, _b;
        try {
          let redirectTo = void 0;
          let captchaToken = void 0;
          if ("options" in params) {
            redirectTo = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo;
            captchaToken = (_b = params.options) === null || _b === void 0 ? void 0 : _b.captchaToken;
          }
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/verify`, {
            headers: this.headers,
            body: Object.assign(Object.assign({}, params), { gotrue_meta_security: { captcha_token: captchaToken } }),
            redirectTo,
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data) {
            const tokenVerificationError = new Error("An error occurred on token verification.");
            throw tokenVerificationError;
          }
          const session = data.session;
          const user = data.user;
          if (session === null || session === void 0 ? void 0 : session.access_token) {
            await this._saveSession(session);
            await this._notifyAllSubscribers(params.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Attempts a single-sign on using an enterprise Identity Provider. A
       * successful SSO attempt will redirect the current page to the identity
       * provider authorization page. The redirect URL is implementation and SSO
       * protocol specific.
       *
       * You can use it by providing a SSO domain. Typically you can extract this
       * domain by asking users for their email address. If this domain is
       * registered on the Auth instance the redirect will use that organization's
       * currently active SSO Identity Provider for the login.
       *
       * If you have built an organization-specific login page, you can use the
       * organization's SSO Identity Provider UUID directly instead.
       */
      async signInWithSSO(params) {
        var _a, _b, _c, _d, _e;
        try {
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce") {
            ;
            [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
          }
          const result = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/sso`, {
            body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in params ? { provider_id: params.providerId } : null), "domain" in params ? { domain: params.domain } : null), { redirect_to: (_b = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo) !== null && _b !== void 0 ? _b : void 0 }), ((_c = params === null || params === void 0 ? void 0 : params.options) === null || _c === void 0 ? void 0 : _c.captchaToken) ? { gotrue_meta_security: { captcha_token: params.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
            headers: this.headers,
            xform: fetch_1._ssoResponse
          });
          if (((_d = result.data) === null || _d === void 0 ? void 0 : _d.url) && (0, helpers_1.isBrowser)() && !((_e = params.options) === null || _e === void 0 ? void 0 : _e.skipBrowserRedirect)) {
            window.location.assign(result.data.url);
          }
          return this._returnResult(result);
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Sends a reauthentication OTP to the user's email or phone number.
       * Requires the user to be signed-in.
       */
      async reauthenticate() {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._reauthenticate();
        });
      }
      async _reauthenticate() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError)
              throw sessionError;
            if (!session)
              throw new errors_1.AuthSessionMissingError();
            const { error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/reauthenticate`, {
              headers: this.headers,
              jwt: session.access_token
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
       */
      async resend(credentials) {
        try {
          const endpoint = `${this.url}/resend`;
          if ("email" in credentials) {
            const { email, type, options } = credentials;
            const { error } = await (0, fetch_1._request)(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                email,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if ("phone" in credentials) {
            const { phone, type, options } = credentials;
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                phone,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a type");
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns the session, refreshing it if necessary.
       *
       * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
       *
       * **IMPORTANT:** This method loads values directly from the storage attached
       * to the client. If that storage is based on request cookies for example,
       * the values in it may not be authentic and therefore it's strongly advised
       * against using this method and its results in such circumstances. A warning
       * will be emitted if this is detected. Use {@link #getUser()} instead.
       */
      async getSession() {
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._useSession(async (result2) => {
            return result2;
          });
        });
        return result;
      }
      /**
       * Acquires a global lock based on the storage key.
       */
      async _acquireLock(acquireTimeout, fn) {
        this._debug("#_acquireLock", "begin", acquireTimeout);
        try {
          if (this.lockAcquired) {
            const last = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve();
            const result = (async () => {
              await last;
              return await fn();
            })();
            this.pendingInLock.push((async () => {
              try {
                await result;
              } catch (e) {
              }
            })());
            return result;
          }
          return await this.lock(`lock:${this.storageKey}`, acquireTimeout, async () => {
            this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
            try {
              this.lockAcquired = true;
              const result = fn();
              this.pendingInLock.push((async () => {
                try {
                  await result;
                } catch (e) {
                }
              })());
              await result;
              while (this.pendingInLock.length) {
                const waitOn = [...this.pendingInLock];
                await Promise.all(waitOn);
                this.pendingInLock.splice(0, waitOn.length);
              }
              return await result;
            } finally {
              this._debug("#_acquireLock", "lock released for storage key", this.storageKey);
              this.lockAcquired = false;
            }
          });
        } finally {
          this._debug("#_acquireLock", "end");
        }
      }
      /**
       * Use instead of {@link #getSession} inside the library. It is
       * semantically usually what you want, as getting a session involves some
       * processing afterwards that requires only one client operating on the
       * session at once across multiple tabs or processes.
       */
      async _useSession(fn) {
        this._debug("#_useSession", "begin");
        try {
          const result = await this.__loadSession();
          return await fn(result);
        } finally {
          this._debug("#_useSession", "end");
        }
      }
      /**
       * NEVER USE DIRECTLY!
       *
       * Always use {@link #_useSession}.
       */
      async __loadSession() {
        this._debug("#__loadSession()", "begin");
        if (!this.lockAcquired) {
          this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
        }
        try {
          let currentSession = null;
          const maybeSession = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey);
          this._debug("#getSession()", "session from storage", maybeSession);
          if (maybeSession !== null) {
            if (this._isValidSession(maybeSession)) {
              currentSession = maybeSession;
            } else {
              this._debug("#getSession()", "session from storage is not valid");
              await this._removeSession();
            }
          }
          if (!currentSession) {
            return { data: { session: null }, error: null };
          }
          const hasExpired = currentSession.expires_at ? currentSession.expires_at * 1e3 - Date.now() < constants_1.EXPIRY_MARGIN_MS : false;
          this._debug("#__loadSession()", `session has${hasExpired ? "" : " not"} expired`, "expires_at", currentSession.expires_at);
          if (!hasExpired) {
            if (this.userStorage) {
              const maybeUser = await (0, helpers_1.getItemAsync)(this.userStorage, this.storageKey + "-user");
              if (maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) {
                currentSession.user = maybeUser.user;
              } else {
                currentSession.user = (0, helpers_1.userNotAvailableProxy)();
              }
            }
            if (this.storage.isServer && currentSession.user && !currentSession.user.__isUserNotAvailableProxy) {
              const suppressWarningRef = { value: this.suppressGetSessionWarning };
              currentSession.user = (0, helpers_1.insecureUserWarningProxy)(currentSession.user, suppressWarningRef);
              if (suppressWarningRef.value) {
                this.suppressGetSessionWarning = true;
              }
            }
            return { data: { session: currentSession }, error: null };
          }
          const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
          if (error) {
            return this._returnResult({ data: { session: null }, error });
          }
          return this._returnResult({ data: { session }, error: null });
        } finally {
          this._debug("#__loadSession()", "end");
        }
      }
      /**
       * Gets the current user details if there is an existing session. This method
       * performs a network request to the Supabase Auth server, so the returned
       * value is authentic and can be used to base authorization rules on.
       *
       * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
       */
      async getUser(jwt) {
        if (jwt) {
          return await this._getUser(jwt);
        }
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._getUser();
        });
        if (result.data.user) {
          this.suppressGetSessionWarning = true;
        }
        return result;
      }
      async _getUser(jwt) {
        try {
          if (jwt) {
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt,
              xform: fetch_1._userResponse
            });
          }
          return await this._useSession(async (result) => {
            var _a, _b, _c;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            if (!((_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) && !this.hasCustomAuthorizationHeader) {
              return { data: { user: null }, error: new errors_1.AuthSessionMissingError() };
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt: (_c = (_b = data.session) === null || _b === void 0 ? void 0 : _b.access_token) !== null && _c !== void 0 ? _c : void 0,
              xform: fetch_1._userResponse
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            if ((0, errors_1.isAuthSessionMissingError)(error)) {
              await this._removeSession();
              await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            }
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Updates user data for a logged in user.
       */
      async updateUser(attributes, options = {}) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._updateUser(attributes, options);
        });
      }
      async _updateUser(attributes, options = {}) {
        try {
          return await this._useSession(async (result) => {
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              throw sessionError;
            }
            if (!sessionData.session) {
              throw new errors_1.AuthSessionMissingError();
            }
            const session = sessionData.session;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce" && attributes.email != null) {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            const { data, error: userError } = await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/user`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: Object.assign(Object.assign({}, attributes), { code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
              jwt: session.access_token,
              xform: fetch_1._userResponse
            });
            if (userError) {
              throw userError;
            }
            session.user = data.user;
            await this._saveSession(session);
            await this._notifyAllSubscribers("USER_UPDATED", session);
            return this._returnResult({ data: { user: session.user }, error: null });
          });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
       * If the refresh token or access token in the current session is invalid, an error will be thrown.
       * @param currentSession The current session that minimally contains an access token and refresh token.
       */
      async setSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._setSession(currentSession);
        });
      }
      async _setSession(currentSession) {
        try {
          if (!currentSession.access_token || !currentSession.refresh_token) {
            throw new errors_1.AuthSessionMissingError();
          }
          const timeNow = Date.now() / 1e3;
          let expiresAt = timeNow;
          let hasExpired = true;
          let session = null;
          const { payload } = (0, helpers_1.decodeJWT)(currentSession.access_token);
          if (payload.exp) {
            expiresAt = payload.exp;
            hasExpired = expiresAt <= timeNow;
          }
          if (hasExpired) {
            const { data: refreshedSession, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!refreshedSession) {
              return { data: { user: null, session: null }, error: null };
            }
            session = refreshedSession;
          } else {
            const { data, error } = await this._getUser(currentSession.access_token);
            if (error) {
              throw error;
            }
            session = {
              access_token: currentSession.access_token,
              refresh_token: currentSession.refresh_token,
              user: data.user,
              token_type: "bearer",
              expires_in: expiresAt - timeNow,
              expires_at: expiresAt
            };
            await this._saveSession(session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user: session.user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns a new session, regardless of expiry status.
       * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
       * If the current session's refresh token is invalid, an error will be thrown.
       * @param currentSession The current session. If passed in, it must contain a refresh token.
       */
      async refreshSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._refreshSession(currentSession);
        });
      }
      async _refreshSession(currentSession) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            if (!currentSession) {
              const { data, error: error2 } = result;
              if (error2) {
                throw error2;
              }
              currentSession = (_a = data.session) !== null && _a !== void 0 ? _a : void 0;
            }
            if (!(currentSession === null || currentSession === void 0 ? void 0 : currentSession.refresh_token)) {
              throw new errors_1.AuthSessionMissingError();
            }
            const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!session) {
              return this._returnResult({ data: { user: null, session: null }, error: null });
            }
            return this._returnResult({ data: { user: session.user, session }, error: null });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Gets the session data from a URL string
       */
      async _getSessionFromURL(params, callbackUrlType) {
        try {
          if (!(0, helpers_1.isBrowser)())
            throw new errors_1.AuthImplicitGrantRedirectError("No browser detected.");
          if (params.error || params.error_description || params.error_code) {
            throw new errors_1.AuthImplicitGrantRedirectError(params.error_description || "Error in URL with unspecified error_description", {
              error: params.error || "unspecified_error",
              code: params.error_code || "unspecified_code"
            });
          }
          switch (callbackUrlType) {
            case "implicit":
              if (this.flowType === "pkce") {
                throw new errors_1.AuthPKCEGrantCodeExchangeError("Not a valid PKCE flow url.");
              }
              break;
            case "pkce":
              if (this.flowType === "implicit") {
                throw new errors_1.AuthImplicitGrantRedirectError("Not a valid implicit grant flow url.");
              }
              break;
            default:
          }
          if (callbackUrlType === "pkce") {
            this._debug("#_initialize()", "begin", "is PKCE flow", true);
            if (!params.code)
              throw new errors_1.AuthPKCEGrantCodeExchangeError("No code detected.");
            const { data: data2, error: error2 } = await this._exchangeCodeForSession(params.code);
            if (error2)
              throw error2;
            const url = new URL(window.location.href);
            url.searchParams.delete("code");
            window.history.replaceState(window.history.state, "", url.toString());
            return { data: { session: data2.session, redirectType: null }, error: null };
          }
          const { provider_token, provider_refresh_token, access_token, refresh_token, expires_in, expires_at, token_type } = params;
          if (!access_token || !expires_in || !refresh_token || !token_type) {
            throw new errors_1.AuthImplicitGrantRedirectError("No session defined in URL");
          }
          const timeNow = Math.round(Date.now() / 1e3);
          const expiresIn = parseInt(expires_in);
          let expiresAt = timeNow + expiresIn;
          if (expires_at) {
            expiresAt = parseInt(expires_at);
          }
          const actuallyExpiresIn = expiresAt - timeNow;
          if (actuallyExpiresIn * 1e3 <= constants_1.AUTO_REFRESH_TICK_DURATION_MS) {
            console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${actuallyExpiresIn}s, should have been closer to ${expiresIn}s`);
          }
          const issuedAt = expiresAt - expiresIn;
          if (timeNow - issuedAt >= 120) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", issuedAt, expiresAt, timeNow);
          } else if (timeNow - issuedAt < 0) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", issuedAt, expiresAt, timeNow);
          }
          const { data, error } = await this._getUser(access_token);
          if (error)
            throw error;
          const session = {
            provider_token,
            provider_refresh_token,
            access_token,
            expires_in: expiresIn,
            expires_at: expiresAt,
            refresh_token,
            token_type,
            user: data.user
          };
          window.location.hash = "";
          this._debug("#_getSessionFromURL()", "clearing window.location.hash");
          return this._returnResult({ data: { session, redirectType: params.type }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, redirectType: null }, error });
          }
          throw error;
        }
      }
      /**
       * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
       *
       * If `detectSessionInUrl` is a function, it will be called with the URL and params to determine
       * if the URL should be processed as a Supabase auth callback. This allows users to exclude
       * URLs from other OAuth providers (e.g., Facebook Login) that also return access_token in the fragment.
       */
      _isImplicitGrantCallback(params) {
        if (typeof this.detectSessionInUrl === "function") {
          return this.detectSessionInUrl(new URL(window.location.href), params);
        }
        return Boolean(params.access_token || params.error_description);
      }
      /**
       * Checks if the current URL and backing storage contain parameters given by a PKCE flow
       */
      async _isPKCECallback(params) {
        const currentStorageContent = await (0, helpers_1.getItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        return !!(params.code && currentStorageContent);
      }
      /**
       * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
       *
       * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
       * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
       *
       * If using `others` scope, no `SIGNED_OUT` event is fired!
       */
      async signOut(options = { scope: "global" }) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._signOut(options);
        });
      }
      async _signOut({ scope } = { scope: "global" }) {
        return await this._useSession(async (result) => {
          var _a;
          const { data, error: sessionError } = result;
          if (sessionError) {
            return this._returnResult({ error: sessionError });
          }
          const accessToken = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
          if (accessToken) {
            const { error } = await this.admin.signOut(accessToken, scope);
            if (error) {
              if (!((0, errors_1.isAuthApiError)(error) && (error.status === 404 || error.status === 401 || error.status === 403))) {
                return this._returnResult({ error });
              }
            }
          }
          if (scope !== "others") {
            await this._removeSession();
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          }
          return this._returnResult({ error: null });
        });
      }
      onAuthStateChange(callback) {
        const id = (0, helpers_1.generateCallbackId)();
        const subscription = {
          id,
          callback,
          unsubscribe: () => {
            this._debug("#unsubscribe()", "state change callback with id removed", id);
            this.stateChangeEmitters.delete(id);
          }
        };
        this._debug("#onAuthStateChange()", "registered callback with id", id);
        this.stateChangeEmitters.set(id, subscription);
        (async () => {
          await this.initializePromise;
          await this._acquireLock(this.lockAcquireTimeout, async () => {
            this._emitInitialSession(id);
          });
        })();
        return { data: { subscription } };
      }
      async _emitInitialSession(id) {
        return await this._useSession(async (result) => {
          var _a, _b;
          try {
            const { data: { session }, error } = result;
            if (error)
              throw error;
            await ((_a = this.stateChangeEmitters.get(id)) === null || _a === void 0 ? void 0 : _a.callback("INITIAL_SESSION", session));
            this._debug("INITIAL_SESSION", "callback id", id, "session", session);
          } catch (err) {
            await ((_b = this.stateChangeEmitters.get(id)) === null || _b === void 0 ? void 0 : _b.callback("INITIAL_SESSION", null));
            this._debug("INITIAL_SESSION", "callback id", id, "error", err);
            console.error(err);
          }
        });
      }
      /**
       * Sends a password reset request to an email address. This method supports the PKCE flow.
       *
       * @param email The email address of the user.
       * @param options.redirectTo The URL to send the user to after they click the password reset link.
       * @param options.captchaToken Verification token received when the user completes the captcha on the site.
       */
      async resetPasswordForEmail(email, options = {}) {
        let codeChallenge = null;
        let codeChallengeMethod = null;
        if (this.flowType === "pkce") {
          ;
          [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(
            this.storage,
            this.storageKey,
            true
            // isPasswordRecovery
          );
        }
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/recover`, {
            body: {
              email,
              code_challenge: codeChallenge,
              code_challenge_method: codeChallengeMethod,
              gotrue_meta_security: { captcha_token: options.captchaToken }
            },
            headers: this.headers,
            redirectTo: options.redirectTo
          });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Gets all the identities linked to a user.
       */
      async getUserIdentities() {
        var _a;
        try {
          const { data, error } = await this.getUser();
          if (error)
            throw error;
          return this._returnResult({ data: { identities: (_a = data.user.identities) !== null && _a !== void 0 ? _a : [] }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async linkIdentity(credentials) {
        if ("token" in credentials) {
          return this.linkIdentityIdToken(credentials);
        }
        return this.linkIdentityOAuth(credentials);
      }
      async linkIdentityOAuth(credentials) {
        var _a;
        try {
          const { data, error } = await this._useSession(async (result) => {
            var _a2, _b, _c, _d, _e;
            const { data: data2, error: error2 } = result;
            if (error2)
              throw error2;
            const url = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, credentials.provider, {
              redirectTo: (_a2 = credentials.options) === null || _a2 === void 0 ? void 0 : _a2.redirectTo,
              scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
              queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
              skipBrowserRedirect: true
            });
            return await (0, fetch_1._request)(this.fetch, "GET", url, {
              headers: this.headers,
              jwt: (_e = (_d = data2.session) === null || _d === void 0 ? void 0 : _d.access_token) !== null && _e !== void 0 ? _e : void 0
            });
          });
          if (error)
            throw error;
          if ((0, helpers_1.isBrowser)() && !((_a = credentials.options) === null || _a === void 0 ? void 0 : _a.skipBrowserRedirect)) {
            window.location.assign(data === null || data === void 0 ? void 0 : data.url);
          }
          return this._returnResult({
            data: { provider: credentials.provider, url: data === null || data === void 0 ? void 0 : data.url },
            error: null
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { provider: credentials.provider, url: null }, error });
          }
          throw error;
        }
      }
      async linkIdentityIdToken(credentials) {
        return await this._useSession(async (result) => {
          var _a;
          try {
            const { error: sessionError, data: { session } } = result;
            if (sessionError)
              throw sessionError;
            const { options, provider, token, access_token, nonce } = credentials;
            const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
              headers: this.headers,
              jwt: (_a = session === null || session === void 0 ? void 0 : session.access_token) !== null && _a !== void 0 ? _a : void 0,
              body: {
                provider,
                id_token: token,
                access_token,
                nonce,
                link_identity: true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponse
            });
            const { data, error } = res;
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            } else if (!data || !data.session || !data.user) {
              return this._returnResult({
                data: { user: null, session: null },
                error: new errors_1.AuthInvalidTokenResponseError()
              });
            }
            if (data.session) {
              await this._saveSession(data.session);
              await this._notifyAllSubscribers("USER_UPDATED", data.session);
            }
            return this._returnResult({ data, error });
          } catch (error) {
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            throw error;
          }
        });
      }
      /**
       * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
       */
      async unlinkIdentity(identity) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/user/identities/${identity.identity_id}`, {
              headers: this.headers,
              jwt: (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : void 0
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Generates a new JWT.
       * @param refreshToken A valid refresh token that was returned on login.
       */
      async _refreshAccessToken(refreshToken) {
        const debugName = `#_refreshAccessToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          const startedAt = Date.now();
          return await (0, helpers_1.retryable)(async (attempt) => {
            if (attempt > 0) {
              await (0, helpers_1.sleep)(200 * Math.pow(2, attempt - 1));
            }
            this._debug(debugName, "refreshing attempt", attempt);
            return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
              body: { refresh_token: refreshToken },
              headers: this.headers,
              xform: fetch_1._sessionResponse
            });
          }, (attempt, error) => {
            const nextBackOffInterval = 200 * Math.pow(2, attempt);
            return error && (0, errors_1.isAuthRetryableFetchError)(error) && // retryable only if the request can be sent before the backoff overflows the tick duration
            Date.now() + nextBackOffInterval - startedAt < constants_1.AUTO_REFRESH_TICK_DURATION_MS;
          });
        } catch (error) {
          this._debug(debugName, "error", error);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        } finally {
          this._debug(debugName, "end");
        }
      }
      _isValidSession(maybeSession) {
        const isValidSession = typeof maybeSession === "object" && maybeSession !== null && "access_token" in maybeSession && "refresh_token" in maybeSession && "expires_at" in maybeSession;
        return isValidSession;
      }
      async _handleProviderSignIn(provider, options) {
        const url = await this._getUrlForProvider(`${this.url}/authorize`, provider, {
          redirectTo: options.redirectTo,
          scopes: options.scopes,
          queryParams: options.queryParams
        });
        this._debug("#_handleProviderSignIn()", "provider", provider, "options", options, "url", url);
        if ((0, helpers_1.isBrowser)() && !options.skipBrowserRedirect) {
          window.location.assign(url);
        }
        return { data: { provider, url }, error: null };
      }
      /**
       * Recovers the session from LocalStorage and refreshes the token
       * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
       */
      async _recoverAndRefresh() {
        var _a, _b;
        const debugName = "#_recoverAndRefresh()";
        this._debug(debugName, "begin");
        try {
          const currentSession = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey);
          if (currentSession && this.userStorage) {
            let maybeUser = await (0, helpers_1.getItemAsync)(this.userStorage, this.storageKey + "-user");
            if (!this.storage.isServer && Object.is(this.storage, this.userStorage) && !maybeUser) {
              maybeUser = { user: currentSession.user };
              await (0, helpers_1.setItemAsync)(this.userStorage, this.storageKey + "-user", maybeUser);
            }
            currentSession.user = (_a = maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) !== null && _a !== void 0 ? _a : (0, helpers_1.userNotAvailableProxy)();
          } else if (currentSession && !currentSession.user) {
            if (!currentSession.user) {
              const separateUser = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey + "-user");
              if (separateUser && (separateUser === null || separateUser === void 0 ? void 0 : separateUser.user)) {
                currentSession.user = separateUser.user;
                await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-user");
                await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, currentSession);
              } else {
                currentSession.user = (0, helpers_1.userNotAvailableProxy)();
              }
            }
          }
          this._debug(debugName, "session from storage", currentSession);
          if (!this._isValidSession(currentSession)) {
            this._debug(debugName, "session is not valid");
            if (currentSession !== null) {
              await this._removeSession();
            }
            return;
          }
          const expiresWithMargin = ((_b = currentSession.expires_at) !== null && _b !== void 0 ? _b : Infinity) * 1e3 - Date.now() < constants_1.EXPIRY_MARGIN_MS;
          this._debug(debugName, `session has${expiresWithMargin ? "" : " not"} expired with margin of ${constants_1.EXPIRY_MARGIN_MS}s`);
          if (expiresWithMargin) {
            if (this.autoRefreshToken && currentSession.refresh_token) {
              const { error } = await this._callRefreshToken(currentSession.refresh_token);
              if (error) {
                console.error(error);
                if (!(0, errors_1.isAuthRetryableFetchError)(error)) {
                  this._debug(debugName, "refresh failed with a non-retryable error, removing the session", error);
                  await this._removeSession();
                }
              }
            }
          } else if (currentSession.user && currentSession.user.__isUserNotAvailableProxy === true) {
            try {
              const { data, error: userError } = await this._getUser(currentSession.access_token);
              if (!userError && (data === null || data === void 0 ? void 0 : data.user)) {
                currentSession.user = data.user;
                await this._saveSession(currentSession);
                await this._notifyAllSubscribers("SIGNED_IN", currentSession);
              } else {
                this._debug(debugName, "could not get user data, skipping SIGNED_IN notification");
              }
            } catch (getUserError) {
              console.error("Error getting user data:", getUserError);
              this._debug(debugName, "error getting user data, skipping SIGNED_IN notification", getUserError);
            }
          } else {
            await this._notifyAllSubscribers("SIGNED_IN", currentSession);
          }
        } catch (err) {
          this._debug(debugName, "error", err);
          console.error(err);
          return;
        } finally {
          this._debug(debugName, "end");
        }
      }
      async _callRefreshToken(refreshToken) {
        var _a, _b;
        if (!refreshToken) {
          throw new errors_1.AuthSessionMissingError();
        }
        if (this.refreshingDeferred) {
          return this.refreshingDeferred.promise;
        }
        const debugName = `#_callRefreshToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          this.refreshingDeferred = new helpers_1.Deferred();
          const { data, error } = await this._refreshAccessToken(refreshToken);
          if (error)
            throw error;
          if (!data.session)
            throw new errors_1.AuthSessionMissingError();
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("TOKEN_REFRESHED", data.session);
          const result = { data: data.session, error: null };
          this.refreshingDeferred.resolve(result);
          return result;
        } catch (error) {
          this._debug(debugName, "error", error);
          if ((0, errors_1.isAuthError)(error)) {
            const result = { data: null, error };
            if (!(0, errors_1.isAuthRetryableFetchError)(error)) {
              await this._removeSession();
            }
            (_a = this.refreshingDeferred) === null || _a === void 0 ? void 0 : _a.resolve(result);
            return result;
          }
          (_b = this.refreshingDeferred) === null || _b === void 0 ? void 0 : _b.reject(error);
          throw error;
        } finally {
          this.refreshingDeferred = null;
          this._debug(debugName, "end");
        }
      }
      async _notifyAllSubscribers(event, session, broadcast = true) {
        const debugName = `#_notifyAllSubscribers(${event})`;
        this._debug(debugName, "begin", session, `broadcast = ${broadcast}`);
        try {
          if (this.broadcastChannel && broadcast) {
            this.broadcastChannel.postMessage({ event, session });
          }
          const errors = [];
          const promises = Array.from(this.stateChangeEmitters.values()).map(async (x) => {
            try {
              await x.callback(event, session);
            } catch (e) {
              errors.push(e);
            }
          });
          await Promise.all(promises);
          if (errors.length > 0) {
            for (let i = 0; i < errors.length; i += 1) {
              console.error(errors[i]);
            }
            throw errors[0];
          }
        } finally {
          this._debug(debugName, "end");
        }
      }
      /**
       * set currentSession and currentUser
       * process to _startAutoRefreshToken if possible
       */
      async _saveSession(session) {
        this._debug("#_saveSession()", session);
        this.suppressGetSessionWarning = true;
        await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        const sessionToProcess = Object.assign({}, session);
        const userIsProxy = sessionToProcess.user && sessionToProcess.user.__isUserNotAvailableProxy === true;
        if (this.userStorage) {
          if (!userIsProxy && sessionToProcess.user) {
            await (0, helpers_1.setItemAsync)(this.userStorage, this.storageKey + "-user", {
              user: sessionToProcess.user
            });
          } else if (userIsProxy) {
          }
          const mainSessionData = Object.assign({}, sessionToProcess);
          delete mainSessionData.user;
          const clonedMainSessionData = (0, helpers_1.deepClone)(mainSessionData);
          await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, clonedMainSessionData);
        } else {
          const clonedSession = (0, helpers_1.deepClone)(sessionToProcess);
          await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, clonedSession);
        }
      }
      async _removeSession() {
        this._debug("#_removeSession()");
        this.suppressGetSessionWarning = false;
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey);
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-code-verifier");
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-user");
        if (this.userStorage) {
          await (0, helpers_1.removeItemAsync)(this.userStorage, this.storageKey + "-user");
        }
        await this._notifyAllSubscribers("SIGNED_OUT", null);
      }
      /**
       * Removes any registered visibilitychange callback.
       *
       * {@see #startAutoRefresh}
       * {@see #stopAutoRefresh}
       */
      _removeVisibilityChangedCallback() {
        this._debug("#_removeVisibilityChangedCallback()");
        const callback = this.visibilityChangedCallback;
        this.visibilityChangedCallback = null;
        try {
          if (callback && (0, helpers_1.isBrowser)() && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
            window.removeEventListener("visibilitychange", callback);
          }
        } catch (e) {
          console.error("removing visibilitychange callback failed", e);
        }
      }
      /**
       * This is the private implementation of {@link #startAutoRefresh}. Use this
       * within the library.
       */
      async _startAutoRefresh() {
        await this._stopAutoRefresh();
        this._debug("#_startAutoRefresh()");
        const ticker = setInterval(() => this._autoRefreshTokenTick(), constants_1.AUTO_REFRESH_TICK_DURATION_MS);
        this.autoRefreshTicker = ticker;
        if (ticker && typeof ticker === "object" && typeof ticker.unref === "function") {
          ticker.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(ticker);
        }
        const timeout = setTimeout(async () => {
          await this.initializePromise;
          await this._autoRefreshTokenTick();
        }, 0);
        this.autoRefreshTickTimeout = timeout;
        if (timeout && typeof timeout === "object" && typeof timeout.unref === "function") {
          timeout.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(timeout);
        }
      }
      /**
       * This is the private implementation of {@link #stopAutoRefresh}. Use this
       * within the library.
       */
      async _stopAutoRefresh() {
        this._debug("#_stopAutoRefresh()");
        const ticker = this.autoRefreshTicker;
        this.autoRefreshTicker = null;
        if (ticker) {
          clearInterval(ticker);
        }
        const timeout = this.autoRefreshTickTimeout;
        this.autoRefreshTickTimeout = null;
        if (timeout) {
          clearTimeout(timeout);
        }
      }
      /**
       * Starts an auto-refresh process in the background. The session is checked
       * every few seconds. Close to the time of expiration a process is started to
       * refresh the session. If refreshing fails it will be retried for as long as
       * necessary.
       *
       * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
       * to call this function, it will be called for you.
       *
       * On browsers the refresh process works only when the tab/window is in the
       * foreground to conserve resources as well as prevent race conditions and
       * flooding auth with requests. If you call this method any managed
       * visibility change callback will be removed and you must manage visibility
       * changes on your own.
       *
       * On non-browser platforms the refresh process works *continuously* in the
       * background, which may not be desirable. You should hook into your
       * platform's foreground indication mechanism and call these methods
       * appropriately to conserve resources.
       *
       * {@see #stopAutoRefresh}
       */
      async startAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._startAutoRefresh();
      }
      /**
       * Stops an active auto refresh process running in the background (if any).
       *
       * If you call this method any managed visibility change callback will be
       * removed and you must manage visibility changes on your own.
       *
       * See {@link #startAutoRefresh} for more details.
       */
      async stopAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._stopAutoRefresh();
      }
      /**
       * Runs the auto refresh token tick.
       */
      async _autoRefreshTokenTick() {
        this._debug("#_autoRefreshTokenTick()", "begin");
        try {
          await this._acquireLock(0, async () => {
            try {
              const now2 = Date.now();
              try {
                return await this._useSession(async (result) => {
                  const { data: { session } } = result;
                  if (!session || !session.refresh_token || !session.expires_at) {
                    this._debug("#_autoRefreshTokenTick()", "no session");
                    return;
                  }
                  const expiresInTicks = Math.floor((session.expires_at * 1e3 - now2) / constants_1.AUTO_REFRESH_TICK_DURATION_MS);
                  this._debug("#_autoRefreshTokenTick()", `access token expires in ${expiresInTicks} ticks, a tick lasts ${constants_1.AUTO_REFRESH_TICK_DURATION_MS}ms, refresh threshold is ${constants_1.AUTO_REFRESH_TICK_THRESHOLD} ticks`);
                  if (expiresInTicks <= constants_1.AUTO_REFRESH_TICK_THRESHOLD) {
                    await this._callRefreshToken(session.refresh_token);
                  }
                });
              } catch (e) {
                console.error("Auto refresh tick failed with error. This is likely a transient error.", e);
              }
            } finally {
              this._debug("#_autoRefreshTokenTick()", "end");
            }
          });
        } catch (e) {
          if (e.isAcquireTimeout || e instanceof locks_1.LockAcquireTimeoutError) {
            this._debug("auto refresh token tick lock not available");
          } else {
            throw e;
          }
        }
      }
      /**
       * Registers callbacks on the browser / platform, which in-turn run
       * algorithms when the browser window/tab are in foreground. On non-browser
       * platforms it assumes always foreground.
       */
      async _handleVisibilityChange() {
        this._debug("#_handleVisibilityChange()");
        if (!(0, helpers_1.isBrowser)() || !(window === null || window === void 0 ? void 0 : window.addEventListener)) {
          if (this.autoRefreshToken) {
            this.startAutoRefresh();
          }
          return false;
        }
        try {
          this.visibilityChangedCallback = async () => await this._onVisibilityChanged(false);
          window === null || window === void 0 ? void 0 : window.addEventListener("visibilitychange", this.visibilityChangedCallback);
          await this._onVisibilityChanged(true);
        } catch (error) {
          console.error("_handleVisibilityChange", error);
        }
      }
      /**
       * Callback registered with `window.addEventListener('visibilitychange')`.
       */
      async _onVisibilityChanged(calledFromInitialize) {
        const methodName = `#_onVisibilityChanged(${calledFromInitialize})`;
        this._debug(methodName, "visibilityState", document.visibilityState);
        if (document.visibilityState === "visible") {
          if (this.autoRefreshToken) {
            this._startAutoRefresh();
          }
          if (!calledFromInitialize) {
            await this.initializePromise;
            await this._acquireLock(this.lockAcquireTimeout, async () => {
              if (document.visibilityState !== "visible") {
                this._debug(methodName, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
                return;
              }
              await this._recoverAndRefresh();
            });
          }
        } else if (document.visibilityState === "hidden") {
          if (this.autoRefreshToken) {
            this._stopAutoRefresh();
          }
        }
      }
      /**
       * Generates the relevant login URL for a third-party provider.
       * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
       * @param options.scopes A space-separated list of scopes granted to the OAuth application.
       * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
       */
      async _getUrlForProvider(url, provider, options) {
        const urlParams = [`provider=${encodeURIComponent(provider)}`];
        if (options === null || options === void 0 ? void 0 : options.redirectTo) {
          urlParams.push(`redirect_to=${encodeURIComponent(options.redirectTo)}`);
        }
        if (options === null || options === void 0 ? void 0 : options.scopes) {
          urlParams.push(`scopes=${encodeURIComponent(options.scopes)}`);
        }
        if (this.flowType === "pkce") {
          const [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
          const flowParams = new URLSearchParams({
            code_challenge: `${encodeURIComponent(codeChallenge)}`,
            code_challenge_method: `${encodeURIComponent(codeChallengeMethod)}`
          });
          urlParams.push(flowParams.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.queryParams) {
          const query = new URLSearchParams(options.queryParams);
          urlParams.push(query.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.skipBrowserRedirect) {
          urlParams.push(`skip_http_redirect=${options.skipBrowserRedirect}`);
        }
        return `${url}?${urlParams.join("&")}`;
      }
      async _unenroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/factors/${params.factorId}`, {
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _enroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            const body = Object.assign({ friendly_name: params.friendlyName, factor_type: params.factorType }, params.factorType === "phone" ? { phone: params.phone } : params.factorType === "totp" ? { issuer: params.issuer } : {});
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors`, {
              body,
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
            if (error) {
              return this._returnResult({ data: null, error });
            }
            if (params.factorType === "totp" && data.type === "totp" && ((_b = data === null || data === void 0 ? void 0 : data.totp) === null || _b === void 0 ? void 0 : _b.qr_code)) {
              data.totp.qr_code = `data:image/svg+xml;utf-8,${data.totp.qr_code}`;
            }
            return this._returnResult({ data, error: null });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _verify(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const body = Object.assign({ challenge_id: params.challengeId }, "webauthn" in params ? {
                webauthn: Object.assign(Object.assign({}, params.webauthn), { credential_response: params.webauthn.type === "create" ? (0, webauthn_1.serializeCredentialCreationResponse)(params.webauthn.credential_response) : (0, webauthn_1.serializeCredentialRequestResponse)(params.webauthn.credential_response) })
              } : { code: params.code });
              const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors/${params.factorId}/verify`, {
                body,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (error) {
                return this._returnResult({ data: null, error });
              }
              await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + data.expires_in }, data));
              await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", data);
              return this._returnResult({ data, error });
            });
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      async _challenge(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors/${params.factorId}/challenge`, {
                body: params,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (response.error) {
                return response;
              }
              const { data } = response;
              if (data.type !== "webauthn") {
                return { data, error: null };
              }
              switch (data.webauthn.type) {
                case "create":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: (0, webauthn_1.deserializeCredentialCreationOptions)(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
                case "request":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: (0, webauthn_1.deserializeCredentialRequestOptions)(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
              }
            });
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      /**
       * {@see GoTrueMFAApi#challengeAndVerify}
       */
      async _challengeAndVerify(params) {
        const { data: challengeData, error: challengeError } = await this._challenge({
          factorId: params.factorId
        });
        if (challengeError) {
          return this._returnResult({ data: null, error: challengeError });
        }
        return await this._verify({
          factorId: params.factorId,
          challengeId: challengeData.id,
          code: params.code
        });
      }
      /**
       * {@see GoTrueMFAApi#listFactors}
       */
      async _listFactors() {
        var _a;
        const { data: { user }, error: userError } = await this.getUser();
        if (userError) {
          return { data: null, error: userError };
        }
        const data = {
          all: [],
          phone: [],
          totp: [],
          webauthn: []
        };
        for (const factor of (_a = user === null || user === void 0 ? void 0 : user.factors) !== null && _a !== void 0 ? _a : []) {
          data.all.push(factor);
          if (factor.status === "verified") {
            ;
            data[factor.factor_type].push(factor);
          }
        }
        return {
          data,
          error: null
        };
      }
      /**
       * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
       */
      async _getAuthenticatorAssuranceLevel() {
        var _a, _b;
        const { data: { session }, error: sessionError } = await this.getSession();
        if (sessionError) {
          return this._returnResult({ data: null, error: sessionError });
        }
        if (!session) {
          return {
            data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
            error: null
          };
        }
        const { payload } = (0, helpers_1.decodeJWT)(session.access_token);
        let currentLevel = null;
        if (payload.aal) {
          currentLevel = payload.aal;
        }
        let nextLevel = currentLevel;
        const verifiedFactors = (_b = (_a = session.user.factors) === null || _a === void 0 ? void 0 : _a.filter((factor) => factor.status === "verified")) !== null && _b !== void 0 ? _b : [];
        if (verifiedFactors.length > 0) {
          nextLevel = "aal2";
        }
        const currentAuthenticationMethods = payload.amr || [];
        return { data: { currentLevel, nextLevel, currentAuthenticationMethods }, error: null };
      }
      /**
       * Retrieves details about an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * Returns authorization details including client info, scopes, and user information.
       * If the API returns a redirect_uri, it means consent was already given - the caller
       * should handle the redirect manually if needed.
       */
      async _getAuthorizationDetails(authorizationId) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/oauth/authorizations/${authorizationId}`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Approves an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _approveAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "approve" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if ((0, helpers_1.isBrowser)() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Denies an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _denyAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "deny" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if ((0, helpers_1.isBrowser)() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth grants that the authenticated user has authorized.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _listOAuthGrants() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Revokes a user's OAuth grant for a specific client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _revokeOAuthGrant(options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              query: { client_id: options.clientId },
              noResolveJson: true
            });
            return { data: {}, error: null };
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async fetchJwk(kid, jwks = { keys: [] }) {
        let jwk = jwks.keys.find((key) => key.kid === kid);
        if (jwk) {
          return jwk;
        }
        const now2 = Date.now();
        jwk = this.jwks.keys.find((key) => key.kid === kid);
        if (jwk && this.jwks_cached_at + constants_1.JWKS_TTL > now2) {
          return jwk;
        }
        const { data, error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, {
          headers: this.headers
        });
        if (error) {
          throw error;
        }
        if (!data.keys || data.keys.length === 0) {
          return null;
        }
        this.jwks = data;
        this.jwks_cached_at = now2;
        jwk = data.keys.find((key) => key.kid === kid);
        if (!jwk) {
          return null;
        }
        return jwk;
      }
      /**
       * Extracts the JWT claims present in the access token by first verifying the
       * JWT against the server's JSON Web Key Set endpoint
       * `/.well-known/jwks.json` which is often cached, resulting in significantly
       * faster responses. Prefer this method over {@link #getUser} which always
       * sends a request to the Auth server for each JWT.
       *
       * If the project is not using an asymmetric JWT signing key (like ECC or
       * RSA) it always sends a request to the Auth server (similar to {@link
       * #getUser}) to verify the JWT.
       *
       * @param jwt An optional specific JWT you wish to verify, not the one you
       *            can obtain from {@link #getSession}.
       * @param options Various additional options that allow you to customize the
       *                behavior of this method.
       */
      async getClaims(jwt, options = {}) {
        try {
          let token = jwt;
          if (!token) {
            const { data, error } = await this.getSession();
            if (error || !data.session) {
              return this._returnResult({ data: null, error });
            }
            token = data.session.access_token;
          }
          const { header, payload, signature, raw: { header: rawHeader, payload: rawPayload } } = (0, helpers_1.decodeJWT)(token);
          if (!(options === null || options === void 0 ? void 0 : options.allowExpired)) {
            (0, helpers_1.validateExp)(payload.exp);
          }
          const signingKey = !header.alg || header.alg.startsWith("HS") || !header.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(header.kid, (options === null || options === void 0 ? void 0 : options.keys) ? { keys: options.keys } : options === null || options === void 0 ? void 0 : options.jwks);
          if (!signingKey) {
            const { error } = await this.getUser(token);
            if (error) {
              throw error;
            }
            return {
              data: {
                claims: payload,
                header,
                signature
              },
              error: null
            };
          }
          const algorithm = (0, helpers_1.getAlgorithm)(header.alg);
          const publicKey = await crypto.subtle.importKey("jwk", signingKey, algorithm, true, [
            "verify"
          ]);
          const isValid = await crypto.subtle.verify(algorithm, publicKey, signature, (0, base64url_1.stringToUint8Array)(`${rawHeader}.${rawPayload}`));
          if (!isValid) {
            throw new errors_1.AuthInvalidJwtError("Invalid JWT signature");
          }
          return {
            data: {
              claims: payload,
              header,
              signature
            },
            error: null
          };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
    };
    GoTrueClient2.nextInstanceID = {};
    exports.default = GoTrueClient2;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/AuthAdminApi.js
var require_AuthAdminApi = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/AuthAdminApi.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    var AuthAdminApi2 = GoTrueAdminApi_1.default;
    exports.default = AuthAdminApi2;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/AuthClient.js
var require_AuthClient = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/AuthClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueClient_1 = tslib_1.__importDefault(require_GoTrueClient());
    var AuthClient2 = GoTrueClient_1.default;
    exports.default = AuthClient2;
  }
});

// ../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/index.js
var require_main3 = __commonJS({
  "../../node_modules/.pnpm/@supabase+auth-js@2.91.1/node_modules/@supabase/auth-js/dist/main/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.processLock = exports.lockInternals = exports.NavigatorLockAcquireTimeoutError = exports.navigatorLock = exports.AuthClient = exports.AuthAdminApi = exports.GoTrueClient = exports.GoTrueAdminApi = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    exports.GoTrueAdminApi = GoTrueAdminApi_1.default;
    var GoTrueClient_1 = tslib_1.__importDefault(require_GoTrueClient());
    exports.GoTrueClient = GoTrueClient_1.default;
    var AuthAdminApi_1 = tslib_1.__importDefault(require_AuthAdminApi());
    exports.AuthAdminApi = AuthAdminApi_1.default;
    var AuthClient_1 = tslib_1.__importDefault(require_AuthClient());
    exports.AuthClient = AuthClient_1.default;
    tslib_1.__exportStar(require_types2(), exports);
    tslib_1.__exportStar(require_errors(), exports);
    var locks_1 = require_locks();
    Object.defineProperty(exports, "navigatorLock", { enumerable: true, get: function() {
      return locks_1.navigatorLock;
    } });
    Object.defineProperty(exports, "NavigatorLockAcquireTimeoutError", { enumerable: true, get: function() {
      return locks_1.NavigatorLockAcquireTimeoutError;
    } });
    Object.defineProperty(exports, "lockInternals", { enumerable: true, get: function() {
      return locks_1.internals;
    } });
    Object.defineProperty(exports, "processLock", { enumerable: true, get: function() {
      return locks_1.processLock;
    } });
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/SupabaseAuthClient.js
var require_SupabaseAuthClient = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/lib/SupabaseAuthClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SupabaseAuthClient = void 0;
    var auth_js_1 = require_main3();
    var SupabaseAuthClient = class extends auth_js_1.AuthClient {
      constructor(options) {
        super(options);
      }
    };
    exports.SupabaseAuthClient = SupabaseAuthClient;
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/SupabaseClient.js
var require_SupabaseClient = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/SupabaseClient.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var functions_js_1 = require_main();
    var postgrest_js_1 = require_dist();
    var realtime_js_1 = require_main2();
    var storage_js_1 = require_dist3();
    var constants_1 = require_constants2();
    var fetch_1 = require_fetch();
    var helpers_1 = require_helpers();
    var SupabaseAuthClient_1 = require_SupabaseAuthClient();
    var SupabaseClient2 = class {
      /**
       * Create a new client for use in the browser.
       * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
       * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
       * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
       * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
       * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
       * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
       * @param options.realtime Options passed along to realtime-js constructor.
       * @param options.storage Options passed along to the storage-js constructor.
       * @param options.global.fetch A custom fetch implementation.
       * @param options.global.headers Any additional headers to send with each network request.
       * @example
       * ```ts
       * import { createClient } from '@supabase/supabase-js'
       *
       * const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
       * const { data } = await supabase.from('profiles').select('*')
       * ```
       */
      constructor(supabaseUrl, supabaseKey, options) {
        var _a, _b, _c;
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
        const baseUrl = (0, helpers_1.validateSupabaseUrl)(supabaseUrl);
        if (!supabaseKey)
          throw new Error("supabaseKey is required.");
        this.realtimeUrl = new URL("realtime/v1", baseUrl);
        this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws");
        this.authUrl = new URL("auth/v1", baseUrl);
        this.storageUrl = new URL("storage/v1", baseUrl);
        this.functionsUrl = new URL("functions/v1", baseUrl);
        const defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
        const DEFAULTS2 = {
          db: constants_1.DEFAULT_DB_OPTIONS,
          realtime: constants_1.DEFAULT_REALTIME_OPTIONS,
          auth: Object.assign(Object.assign({}, constants_1.DEFAULT_AUTH_OPTIONS), { storageKey: defaultStorageKey }),
          global: constants_1.DEFAULT_GLOBAL_OPTIONS
        };
        const settings = (0, helpers_1.applySettingDefaults)(options !== null && options !== void 0 ? options : {}, DEFAULTS2);
        this.storageKey = (_a = settings.auth.storageKey) !== null && _a !== void 0 ? _a : "";
        this.headers = (_b = settings.global.headers) !== null && _b !== void 0 ? _b : {};
        if (!settings.accessToken) {
          this.auth = this._initSupabaseAuthClient((_c = settings.auth) !== null && _c !== void 0 ? _c : {}, this.headers, settings.global.fetch);
        } else {
          this.accessToken = settings.accessToken;
          this.auth = new Proxy({}, {
            get: (_, prop) => {
              throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
            }
          });
        }
        this.fetch = (0, fetch_1.fetchWithAuth)(supabaseKey, this._getAccessToken.bind(this), settings.global.fetch);
        this.realtime = this._initRealtimeClient(Object.assign({ headers: this.headers, accessToken: this._getAccessToken.bind(this) }, settings.realtime));
        if (this.accessToken) {
          this.accessToken().then((token) => this.realtime.setAuth(token)).catch((e) => console.warn("Failed to set initial Realtime auth token:", e));
        }
        this.rest = new postgrest_js_1.PostgrestClient(new URL("rest/v1", baseUrl).href, {
          headers: this.headers,
          schema: settings.db.schema,
          fetch: this.fetch
        });
        this.storage = new storage_js_1.StorageClient(this.storageUrl.href, this.headers, this.fetch, options === null || options === void 0 ? void 0 : options.storage);
        if (!settings.accessToken) {
          this._listenForAuthEvents();
        }
      }
      /**
       * Supabase Functions allows you to deploy and invoke edge functions.
       */
      get functions() {
        return new functions_js_1.FunctionsClient(this.functionsUrl.href, {
          headers: this.headers,
          customFetch: this.fetch
        });
      }
      /**
       * Perform a query on a table or a view.
       *
       * @param relation - The table or view name to query
       */
      from(relation) {
        return this.rest.from(relation);
      }
      // NOTE: signatures must be kept in sync with PostgrestClient.schema
      /**
       * Select a schema to query or perform an function (rpc) call.
       *
       * The schema needs to be on the list of exposed schemas inside Supabase.
       *
       * @param schema - The schema to query
       */
      schema(schema) {
        return this.rest.schema(schema);
      }
      // NOTE: signatures must be kept in sync with PostgrestClient.rpc
      /**
       * Perform a function call.
       *
       * @param fn - The function name to call
       * @param args - The arguments to pass to the function call
       * @param options - Named parameters
       * @param options.head - When set to `true`, `data` will not be returned.
       * Useful if you only need the count.
       * @param options.get - When set to `true`, the function will be called with
       * read-only access mode.
       * @param options.count - Count algorithm to use to count rows returned by the
       * function. Only applicable for [set-returning
       * functions](https://www.postgresql.org/docs/current/functions-srf.html).
       *
       * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
       * hood.
       *
       * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
       * statistics under the hood.
       *
       * `"estimated"`: Uses exact count for low numbers and planned count for high
       * numbers.
       */
      rpc(fn, args = {}, options = {
        head: false,
        get: false,
        count: void 0
      }) {
        return this.rest.rpc(fn, args, options);
      }
      /**
       * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
       *
       * @param {string} name - The name of the Realtime channel.
       * @param {Object} opts - The options to pass to the Realtime channel.
       *
       */
      channel(name, opts = { config: {} }) {
        return this.realtime.channel(name, opts);
      }
      /**
       * Returns all Realtime channels.
       */
      getChannels() {
        return this.realtime.getChannels();
      }
      /**
       * Unsubscribes and removes Realtime channel from Realtime client.
       *
       * @param {RealtimeChannel} channel - The name of the Realtime channel.
       *
       */
      removeChannel(channel) {
        return this.realtime.removeChannel(channel);
      }
      /**
       * Unsubscribes and removes all Realtime channels from Realtime client.
       */
      removeAllChannels() {
        return this.realtime.removeAllChannels();
      }
      async _getAccessToken() {
        var _a, _b;
        if (this.accessToken) {
          return await this.accessToken();
        }
        const { data } = await this.auth.getSession();
        return (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : this.supabaseKey;
      }
      _initSupabaseAuthClient({ autoRefreshToken, persistSession, detectSessionInUrl, storage, userStorage, storageKey, flowType, lock, debug, throwOnError }, headers, fetch2) {
        const authHeaders = {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: `${this.supabaseKey}`
        };
        return new SupabaseAuthClient_1.SupabaseAuthClient({
          url: this.authUrl.href,
          headers: Object.assign(Object.assign({}, authHeaders), headers),
          storageKey,
          autoRefreshToken,
          persistSession,
          detectSessionInUrl,
          storage,
          userStorage,
          flowType,
          lock,
          debug,
          throwOnError,
          fetch: fetch2,
          // auth checks if there is a custom authorizaiton header using this flag
          // so it knows whether to return an error when getUser is called with no session
          hasCustomAuthorizationHeader: Object.keys(this.headers).some((key) => key.toLowerCase() === "authorization")
        });
      }
      _initRealtimeClient(options) {
        return new realtime_js_1.RealtimeClient(this.realtimeUrl.href, Object.assign(Object.assign({}, options), { params: Object.assign({ apikey: this.supabaseKey }, options === null || options === void 0 ? void 0 : options.params) }));
      }
      _listenForAuthEvents() {
        const data = this.auth.onAuthStateChange((event, session) => {
          this._handleTokenChanged(event, "CLIENT", session === null || session === void 0 ? void 0 : session.access_token);
        });
        return data;
      }
      _handleTokenChanged(event, source, token) {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
          this.changedAccessToken = token;
          this.realtime.setAuth(token);
        } else if (event === "SIGNED_OUT") {
          this.realtime.setAuth();
          if (source == "STORAGE")
            this.auth.signOut();
          this.changedAccessToken = void 0;
        }
      }
    };
    exports.default = SupabaseClient2;
  }
});

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/index.js
var require_main4 = __commonJS({
  "../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/main/index.js"(exports) {
    "use strict";
    var __createBinding2 = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar2 = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
    };
    var __importDefault2 = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createClient = exports.SupabaseClient = exports.FunctionRegion = exports.FunctionsError = exports.FunctionsRelayError = exports.FunctionsFetchError = exports.FunctionsHttpError = exports.PostgrestError = void 0;
    var SupabaseClient_1 = __importDefault2(require_SupabaseClient());
    __exportStar2(require_main3(), exports);
    var postgrest_js_1 = require_dist();
    Object.defineProperty(exports, "PostgrestError", { enumerable: true, get: function() {
      return postgrest_js_1.PostgrestError;
    } });
    var functions_js_1 = require_main();
    Object.defineProperty(exports, "FunctionsHttpError", { enumerable: true, get: function() {
      return functions_js_1.FunctionsHttpError;
    } });
    Object.defineProperty(exports, "FunctionsFetchError", { enumerable: true, get: function() {
      return functions_js_1.FunctionsFetchError;
    } });
    Object.defineProperty(exports, "FunctionsRelayError", { enumerable: true, get: function() {
      return functions_js_1.FunctionsRelayError;
    } });
    Object.defineProperty(exports, "FunctionsError", { enumerable: true, get: function() {
      return functions_js_1.FunctionsError;
    } });
    Object.defineProperty(exports, "FunctionRegion", { enumerable: true, get: function() {
      return functions_js_1.FunctionRegion;
    } });
    __exportStar2(require_main2(), exports);
    var SupabaseClient_2 = require_SupabaseClient();
    Object.defineProperty(exports, "SupabaseClient", { enumerable: true, get: function() {
      return __importDefault2(SupabaseClient_2).default;
    } });
    var createClient2 = (supabaseUrl, supabaseKey, options) => {
      return new SupabaseClient_1.default(supabaseUrl, supabaseKey, options);
    };
    exports.createClient = createClient2;
    function shouldShowDeprecationWarning() {
      if (typeof window !== "undefined") {
        return false;
      }
      if (typeof process === "undefined") {
        return false;
      }
      const processVersion = process["version"];
      if (processVersion === void 0 || processVersion === null) {
        return false;
      }
      const versionMatch = processVersion.match(/^v(\d+)\./);
      if (!versionMatch) {
        return false;
      }
      const majorVersion = parseInt(versionMatch[1], 10);
      return majorVersion <= 18;
    }
    if (shouldShowDeprecationWarning()) {
      console.warn(`\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217`);
    }
  }
});

// src/script/tag-constants.ts
var BLOCK_TAG_NAMES = ["s1", "s2", "g1", "g2", "note"];
var CUE_TAG_NAMES = ["pause", "beat", "reflective pause"];
var INLINE_TAG_BASES = ["color", "bg", "speaker", "guest", "b", "i"];
var INLINE_TAG_NAMES = INLINE_TAG_BASES.flatMap((tag) => [tag, `/${tag}`]);
var INLINE_ATTR_PATTERNS = INLINE_TAG_BASES.map((tag) => `${tag}(?:=[^\\]]+)?`);
var SPEAKER_TAG_NAMES = BLOCK_TAG_NAMES.filter((tag) => tag !== "note");
var ALLOWED_NORMALIZED_TAG_NAMES = [
  ...BLOCK_TAG_NAMES,
  ...CUE_TAG_NAMES,
  ...INLINE_TAG_NAMES
];

// src/script/normalize.ts
var BLOCK_TAG_PATTERN = BLOCK_TAG_NAMES.join("|");
var CUE_TAG_PATTERN = CUE_TAG_NAMES.join("|");
var INLINE_TAG_PATTERN = INLINE_TAG_BASES.join("|");
var ALLOWED_TAG_SET = new Set(ALLOWED_NORMALIZED_TAG_NAMES);
var INLINE_CANONICAL_REGEXP = new RegExp(
  `\\[\\s*(\\/)?\\s*(${INLINE_TAG_PATTERN})(\\s*=\\s*[^\\]]+)?\\s*\\]`,
  "gi"
);
function normalizeToStandardText(input = "") {
  let text = String(input ?? "");
  text = text.replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u00A0/g, " ");
  text = text.replace(new RegExp(`\\[\\s*(${BLOCK_TAG_PATTERN})\\s*\\]`, "gi"), (_, tag) => `[${String(tag).toLowerCase()}]`).replace(new RegExp(`\\[\\s*\\/\\s*(${BLOCK_TAG_PATTERN})\\s*\\]`, "gi"), (_, tag) => `[/${String(tag).toLowerCase()}]`).replace(new RegExp(`\\[\\s*(${CUE_TAG_PATTERN})\\s*\\]`, "gi"), (_, tag) => `[${String(tag).toLowerCase()}]`);
  text = text.replace(INLINE_CANONICAL_REGEXP, (_, slash, tag, attr) => {
    const normalizedTag = String(tag).toLowerCase();
    let attrStr = "";
    if (attr) {
      const eqIndex = attr.indexOf("=");
      if (eqIndex >= 0) {
        const value = attr.slice(eqIndex + 1).trim();
        attrStr = "=" + value;
      }
    }
    const prefix = slash ? "/" : "";
    return `[${prefix}${normalizedTag}${attrStr}]`;
  });
  text = text.replace(/\[([^\]]+)\]/g, (match, inner) => {
    const trimmed = String(inner || "").trim();
    if (!trimmed) return "";
    const eqIndex = trimmed.indexOf("=");
    const head = eqIndex >= 0 ? trimmed.slice(0, eqIndex) : trimmed;
    let key = head.trim().toLowerCase();
    if (key.startsWith("/")) key = key.slice(1).trim();
    key = key.replace(/\s+/g, " ");
    return ALLOWED_TAG_SET.has(key) ? match : "";
  });
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}
function fallbackNormalizeText(input = "") {
  let text = String(input ?? "");
  text = text.replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return text;
}

// src/format-inline.ts
var ROLE_DEFAULTS = {
  // Match legacy Speaker defaults; still defer to CSS vars when provided.
  s1: { name: "S1", color: "var(--s1-color, #60a5fa)" },
  // Joe light blue
  s2: { name: "S2", color: "var(--s2-color, #facc15)" },
  // Brad yellow
  g1: { name: "G1", color: "var(--g1-color, #34d399)" },
  // Guest 1 green
  g2: { name: "G2", color: "var(--g2-color, #f472b6)" }
  // Guest 2 pink
};
var ROLES = { ...ROLE_DEFAULTS };
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
function safeColor(c) {
  const s = String(c ?? "").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  if (/^rgba?\(/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return "";
}
function roleStyle(key) {
  const k = key.toLowerCase() in ROLES ? key.toLowerCase() : "s1";
  const item = ROLES[k];
  return `color:${item.color}; font-size:inherit; line-height:inherit;`;
}
function formatInlineMarkup(text) {
  let s = escapeHtml(text);
  s = s.replace(/\[b\]([\s\S]+?)\[\/b\]/gi, "<strong>$1</strong>").replace(/\[i\]([\s\S]+?)\[\/i\]/gi, "<em>$1</em>").replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1</span>').replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1</div>');
  s = s.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_m, col, inner) => {
    const c = safeColor(col);
    return c ? `<span style="color:${c}">${inner}</span>` : inner;
  });
  s = s.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_m, col, inner) => {
    const c = safeColor(col);
    return c ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}</span>` : inner;
  });
  s = s.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_m, inner) => `<span style="${roleStyle("s1")}">${inner}</span>`);
  s = s.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_m, inner) => `<span style="${roleStyle("s2")}">${inner}</span>`);
  s = s.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, "$2");
  s = s.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_m, idx, inner) => {
    return `<span style="${roleStyle("s" + String(idx))}">${inner}</span>`;
  });
  s = s.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, "$2");
  s = s.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, "");
  s = s.replace(/\[(pause|beat|reflective pause)\]/gi, (_m, cue) => {
    const normalized = String(cue || "").toLowerCase();
    return `<span class="tp-cue" data-cue="${normalized}">[${cue}]</span>`;
  });
  return s;
}
try {
  window.formatInlineMarkup = formatInlineMarkup;
} catch {
}

// src/scroll/asr-block-store.ts
var blockEls = [];
var blockMeta = null;
function isDevMode() {
  try {
    const qs = new URLSearchParams(String(location.search || ""));
    if (qs.has("dev") || qs.get("dev") === "1") return true;
    if (qs.has("dev1") || qs.get("dev1") === "1") return true;
    if (qs.has("ci") || qs.get("ci") === "1") return true;
    if (window.__TP_DEV || window.__TP_DEV1) return true;
    if (localStorage.getItem("tp_dev_mode") === "1") return true;
  } catch {
  }
  return false;
}
function setAsrBlocks(nextEls, meta2) {
  blockEls = Array.isArray(nextEls) ? nextEls : [];
  blockMeta = meta2 || null;
  const payload = {
    ready: true,
    blockCount: blockEls.length,
    schemaVersion: Number(meta2?.schemaVersion || 1),
    source: meta2?.source || "render"
  };
  try {
    window.__tpAsrBlocksReady = true;
    window.__tpAsrBlockCount = blockEls.length;
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:asr:blocks-ready", { detail: payload }));
  } catch {
  }
  try {
    document.dispatchEvent(new CustomEvent("tp:asr:blocks-ready", { detail: payload }));
  } catch {
  }
  if (isDevMode()) {
    try {
      console.debug("[asr-block-store] blocks ready", payload);
    } catch {
    }
  }
}
function getAsrBlockElements() {
  return blockEls;
}
function getAsrBlockIndex() {
  return blockMeta;
}

// src/scroll/scroller.ts
var displayScrollChannel = null;
var scrollEventTrackerInstalled = false;
function shouldLogScrollWrite() {
  if (typeof window === "undefined") return false;
  try {
    const w2 = window;
    if (w2.__tpScrollDebug === true) return true;
    if (w2.__tpScrollWriteDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || "");
    if (qs.has("scrollDebug") || qs.has("scrollWriteDebug")) return true;
  } catch {
  }
  return false;
}
function readLineIndex(el) {
  if (!el) return null;
  const line = el.closest ? el.closest(".line") : null;
  if (!line) return null;
  const raw = line.dataset.i || line.dataset.index || line.dataset.lineIdx || line.dataset.line || line.getAttribute("data-line") || line.getAttribute("data-line-idx");
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const id = line.id || "";
  const m = /^tp-line-(\d+)$/.exec(id);
  if (m) return Math.max(0, Number(m[1]));
  return null;
}
function computeAnchorLineIndex(scroller) {
  if (!scroller) return null;
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const rect = scroller.getBoundingClientRect();
  if (!rect.height || !rect.width) return null;
  const markerPct = typeof window.__TP_MARKER_PCT === "number" ? window.__TP_MARKER_PCT : 0.4;
  const markerY = rect.top + rect.height * markerPct;
  const markerX = rect.left + rect.width * 0.5;
  const hit = document.elementFromPoint(markerX, markerY);
  const hitIdx = readLineIndex(hit);
  if (hitIdx != null) return hitIdx;
  const lines = Array.from(scroller.querySelectorAll(".line"));
  if (!lines.length) return null;
  let bestIdx = null;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const el = lines[i];
    const r = el.getBoundingClientRect();
    const y = r.top + r.height * 0.5;
    const d = Math.abs(y - markerY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = readLineIndex(el) ?? i;
    }
  }
  return bestIdx != null ? Math.max(0, Math.floor(bestIdx)) : null;
}
function isElementLike(node) {
  return !!node && typeof node === "object" && node.nodeType === 1;
}
function getDisplayViewerElement() {
  if (typeof window === "undefined") return null;
  try {
    const w2 = window;
    const direct = w2.__tpDisplayViewerEl;
    if (isElementLike(direct)) return direct;
    const opener = w2.opener;
    const viaOpener = opener && !opener.closed ? opener.__tpDisplayViewerEl : null;
    if (isElementLike(viaOpener)) return viaOpener;
  } catch {
  }
  return null;
}
function getScrollerEl(role = "main") {
  if (typeof document === "undefined") return null;
  if (role === "display") {
    return getDisplayViewerElement() || document.getElementById("wrap");
  }
  try {
    return document.querySelector("main#viewer.viewer, #viewer") || document.getElementById("viewer");
  } catch {
    return document.getElementById("viewer");
  }
}
function getViewerElement() {
  try {
    return getScrollerEl("main") || document.querySelector('[data-role="viewer"]') || document.getElementById("wrap") || getDisplayViewerElement();
  } catch {
    return getDisplayViewerElement();
  }
}
function getScriptRoot() {
  try {
    return document.getElementById("script");
  } catch {
    return null;
  }
}
function getFallbackScroller() {
  try {
    return getScrollerEl("main") || getScrollerEl("display") || getScriptRoot() || document.getElementById("wrap");
  } catch {
    return null;
  }
}
function isScrollable(el) {
  if (!el) return false;
  if (el.scrollHeight - el.clientHeight > 2) return true;
  try {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY || "");
  } catch {
    return false;
  }
}
function resolveActiveScroller(primary, fallback) {
  if (isScrollable(primary)) return primary;
  if (isScrollable(fallback)) return fallback;
  return primary || fallback;
}
function describeElement(el) {
  if (!el) return "none";
  const id = el.id ? `#${el.id}` : "";
  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : "";
  return `${el.tagName.toLowerCase()}${id}${cls}` || el.tagName.toLowerCase();
}
function getPrimaryScroller() {
  return getScrollerEl("main") || getScrollerEl("display");
}
function resolveViewerRole() {
  if (typeof window === "undefined") return "main";
  try {
    const explicit = String(window.__TP_VIEWER_ROLE || "").toLowerCase();
    if (explicit === "display") return "display";
    if (explicit === "main") return "main";
    const bodyRole = String(window.document?.body?.dataset?.viewerRole || "").toLowerCase();
    if (bodyRole === "display") return "display";
    if (bodyRole === "main") return "main";
    if (window.__TP_FORCE_DISPLAY) return "display";
    const path = String(window.location?.pathname || "").toLowerCase();
    if (path.includes("display")) return "display";
  } catch {
  }
  return "main";
}
function getRuntimeScroller(role = resolveViewerRole()) {
  if (typeof document === "undefined") return null;
  const root = getScriptRoot();
  if (role === "display") {
    const primary2 = getScrollerEl("display");
    const fallback2 = document.getElementById("wrap") || root;
    return resolveActiveScroller(primary2, fallback2);
  }
  const primary = getScrollerEl("main") || root;
  const fallback = root || getScrollerEl("display");
  return resolveActiveScroller(primary, fallback);
}
function isDisplayWindow() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("display") === "1") return true;
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("display")) return true;
    if (window.__TP_FORCE_DISPLAY) return true;
  } catch {
  }
  return false;
}
function isDevScrollSync() {
  if (typeof window === "undefined") return false;
  try {
    const w2 = window;
    if (w2.__tpScrollDebug || w2.__tpScrollSyncDebug) return true;
    if (w2.__TP_DEV || w2.__TP_DEV1 || w2.__tpDevMode) return true;
    if (w2.localStorage?.getItem("tp_dev_mode") === "1") return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("scrollDebug") || params.has("dev") || params.has("debug")) return true;
  } catch {
  }
  return false;
}
function applyCanonicalScrollTop(topPx, opts = {}) {
  const scroller = opts.scroller || resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
  if (!scroller) return 0;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const target = Math.max(0, Math.min(Number(topPx) || 0, max));
  const before = scroller.scrollTop || 0;
  try {
    scroller.scrollTop = target;
  } catch {
  }
  const after = scroller.scrollTop || target;
  const writerSource = opts.source ?? opts.reason ?? "programmatic";
  try {
    scroller.dataset.tpLastWriter = writerSource;
  } catch {
  }
  if (shouldLogScrollWrite()) {
    try {
      console.info("[SCROLL_WRITE_DETAIL]", {
        source: writerSource,
        reason: opts.reason,
        target: Math.round(target),
        before: Math.round(before),
        after: Math.round(after),
        scroller: describeElement(scroller)
      });
    } catch {
    }
  }
  try {
    let actualTop = target;
    try {
      actualTop = scroller.scrollTop || target;
    } catch {
    }
    const ratio = max > 0 ? actualTop / max : 0;
    const cursorLine = computeAnchorLineIndex(scroller);
    const payload = {
      type: "scroll",
      top: actualTop,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? void 0
    };
    const send = window.sendToDisplay || window.__tpSendToDisplay || window.__tpDisplay?.sendToDisplay;
    if (typeof send === "function") {
      send(payload);
    } else {
      const displayWin = window.__tpDisplayWindow;
      if (displayWin && !displayWin.closed && typeof displayWin.postMessage === "function") {
        displayWin.postMessage(payload, "*");
      } else if (typeof BroadcastChannel !== "undefined") {
        if (!displayScrollChannel) {
          try {
            displayScrollChannel = new BroadcastChannel("tp_display");
          } catch {
          }
        }
        try {
          displayScrollChannel?.postMessage(payload);
        } catch {
        }
      }
    }
  } catch {
  }
  if (isDevScrollSync()) {
    try {
      console.debug("[SCROLL_SYNC]", {
        top: Math.round(target),
        scroller: describeElement(scroller),
        reason: opts.reason
      });
    } catch {
    }
  }
  return target;
}
if (typeof window !== "undefined") {
  try {
    const w2 = window;
    if (!isDisplayWindow()) {
      w2.__tpScrollWrite = {
        scrollTo(top) {
          applyCanonicalScrollTop(top, { reason: "writer:scrollTo", source: "scroll-writer" });
        },
        scrollBy(delta) {
          const sc = resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
          const cur = sc ? sc.scrollTop || 0 : 0;
          applyCanonicalScrollTop(cur + (Number(delta) || 0), { reason: "writer:scrollBy", source: "scroll-writer" });
        }
      };
    }
  } catch {
  }
}
if (typeof window !== "undefined") {
  try {
    if (!scrollEventTrackerInstalled) {
      const handler = (event) => {
        if (!shouldLogScrollWrite()) return;
        const target = event.target;
        if (!target) return;
        try {
          console.info("[SCROLL_EVENT]", {
            scrollTop: Math.round(target.scrollTop || 0),
            tpLastWriter: target.dataset.tpLastWriter ?? null,
            isTrusted: event.isTrusted,
            scroller: describeElement(target)
          });
        } catch {
        }
      };
      window.addEventListener("scroll", handler, { capture: true, passive: true });
      scrollEventTrackerInstalled = true;
    }
  } catch {
  }
}

// src/env/dev-log.ts
var MIN_LOG_LEVEL = 0;
var MAX_LOG_LEVEL = 3;
var DEFAULT_DEV_LOG_LEVEL = 1;
function clampLogLevel(value) {
  if (!Number.isFinite(value)) return MIN_LOG_LEVEL;
  return Math.max(MIN_LOG_LEVEL, Math.min(MAX_LOG_LEVEL, Math.floor(value)));
}
function parseLogLevelRaw(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clampLogLevel(parsed);
}
function isDevContext() {
  if (typeof window === "undefined") return false;
  try {
    const w2 = window;
    if (w2.__TP_DEV || w2.__TP_DEV1 || w2.__tpDevMode) return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("dev") || params.has("debug") || params.has("dev1")) return true;
    if (window.localStorage?.getItem("tp_dev_mode") === "1") return true;
  } catch {
  }
  return false;
}
function getTpLogLevel() {
  if (typeof window === "undefined") return MIN_LOG_LEVEL;
  try {
    const w2 = window;
    const runtimeLevel = parseLogLevelRaw(w2.__tpLogLevel);
    if (runtimeLevel != null) return runtimeLevel;
  } catch {
  }
  try {
    const stored = parseLogLevelRaw(window.localStorage?.getItem("tp_log_level"));
    if (stored != null) return stored;
  } catch {
  }
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = parseLogLevelRaw(params.get("tp_log_level")) ?? parseLogLevelRaw(params.get("logLevel")) ?? parseLogLevelRaw(params.get("log"));
    if (fromQuery != null) return fromQuery;
  } catch {
  }
  return isDevContext() ? DEFAULT_DEV_LOG_LEVEL : MIN_LOG_LEVEL;
}
function shouldLogLevel(minLevel) {
  return getTpLogLevel() >= clampLogLevel(minLevel);
}

// src/scroll/scroll-writer.ts
var cached = null;
var warned = false;
var activeSeekAnim = null;
var activeSeekAnimRunId = 0;
var lastWriteMismatchAt = 0;
var lastWriteMismatchKey = "";
var lastNonFiniteGuardAt = 0;
var WRITE_MISMATCH_LOG_THROTTLE_MS = 2e3;
var WRITE_MISMATCH_EPSILON_PX = 1;
var NON_FINITE_GUARD_THROTTLE_MS = 1e3;
var ASR_SEEK_DEFAULT_LINES_PER_SEC = 2.8;
var ASR_SEEK_MIN_DURATION_MS = 140;
var ASR_SEEK_MAX_DURATION_MS = 560;
var ASR_SEEK_EPSILON_PX = 0.5;
var ASR_SEEK_MIN_PX_PER_SEC = 36;
var ASR_SEEK_MAX_PX_PER_SEC = 420;
var ASR_SEEK_MAX_VIEWPORTS_PER_SEC = 1.25;
function shouldWarnWrites() {
  return shouldLogLevel(1);
}
function shouldVerboseWrites() {
  return shouldLogLevel(2);
}
function shouldTraceWrites() {
  return shouldLogLevel(3);
}
function logNonFiniteGuard(reason, value, detail) {
  if (!shouldWarnWrites()) return;
  const now2 = Date.now();
  if (now2 - lastNonFiniteGuardAt < NON_FINITE_GUARD_THROTTLE_MS) return;
  lastNonFiniteGuardAt = now2;
  try {
    console.warn("[scroll-writer] non-finite value", {
      reason,
      value,
      ...detail || {}
    });
  } catch {
  }
}
function withWriteEnabled(reason, delta, fn) {
  const w2 = window;
  const prev = w2.__tpScrollWriteActive;
  w2.__tpScrollWriteActive = true;
  if (shouldTraceWrites()) {
    try {
      console.trace("[scroll-write]", reason, delta);
    } catch {
    }
  }
  try {
    return fn();
  } finally {
    w2.__tpScrollWriteActive = prev;
  }
}
function findScroller(el) {
  const runtime = getRuntimeScroller(resolveViewerRole());
  return runtime || getScrollerEl("main") || getScrollerEl("display") || getDisplayViewerElement() || getViewerElement() || el;
}
function elementTopRelativeTo(el, scroller) {
  try {
    const rect = el.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    return rect.top - scRect.top + scroller.scrollTop;
  } catch {
    return el.offsetTop || 0;
  }
}
function markerOffsetPx(fallbackScroller) {
  const markerPct = typeof window.__TP_MARKER_PCT === "number" ? window.__TP_MARKER_PCT : 0.4;
  const viewer2 = getViewerElement();
  const host = viewer2 || fallbackScroller;
  const h = host?.clientHeight || window.innerHeight || 0;
  return Math.max(0, Math.round(h * markerPct));
}
function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function getScrollMode() {
  try {
    const store2 = window.__tpStore;
    if (store2 && typeof store2.get === "function") {
      const scrollMode = store2.get("scrollMode");
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = store2.get("mode");
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }
    const router = window.__tpScrollMode;
    if (router && typeof router.getMode === "function") {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }
    if (typeof router === "string") return router.toLowerCase();
  } catch {
  }
  return "";
}
function prefersReducedMotion() {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}
function cancelSeekAnimation() {
  activeSeekAnimRunId += 1;
  if (!activeSeekAnim) return;
  try {
    activeSeekAnim.cancel();
  } catch {
  }
  activeSeekAnim = null;
}
function readScrollTop(scroller) {
  return scroller.scrollTop || 0;
}
function getDeltaScroller() {
  return getRuntimeScroller(resolveViewerRole()) || getScrollerEl("main") || getScrollerEl("display") || getDisplayViewerElement() || document.getElementById("wrap");
}
function estimateDelta(targetTop) {
  try {
    const sc = getDeltaScroller();
    const cur = sc ? readScrollTop(sc) : 0;
    return (Number(targetTop) || 0) - (Number(cur) || 0);
  } catch {
    return Number(targetTop) || 0;
  }
}
function logWriteMismatch(scroller, target, before, after, reason) {
  if (!shouldWarnWrites()) return;
  if (Math.abs(after - target) <= WRITE_MISMATCH_EPSILON_PX) return;
  const now2 = Date.now();
  const key = `${reason}|${describeElement(scroller)}|${Math.round(target)}|${Math.round(after)}`;
  if (key === lastWriteMismatchKey && now2 - lastWriteMismatchAt < WRITE_MISMATCH_LOG_THROTTLE_MS) return;
  lastWriteMismatchKey = key;
  lastWriteMismatchAt = now2;
  let overflow = "";
  let overflowY = "";
  try {
    const style = getComputedStyle(scroller);
    overflow = String(style.overflow || "");
    overflowY = String(style.overflowY || "");
  } catch {
    overflow = "";
    overflowY = "";
  }
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const activeScroller = getRuntimeScroller(resolveViewerRole());
  try {
    console.warn("[scroll-writer] write mismatch", {
      reason,
      scroller: describeElement(scroller),
      targetTop: Math.round(target),
      before: Math.round(before),
      after: Math.round(after),
      deltaPx: Math.round(after - before),
      overflow,
      overflowY,
      scrollHeight: Math.round(scroller.scrollHeight || 0),
      clientHeight: Math.round(scroller.clientHeight || 0),
      maxTop: Math.round(maxTop),
      activeScroller: describeElement(activeScroller),
      isActiveScroller: activeScroller === scroller
    });
  } catch {
  }
}
function writeScrollTop(scroller, top, reason = "writeScrollTop") {
  const rawFrom = scroller.scrollTop;
  const from = Number.isFinite(rawFrom) ? rawFrom : 0;
  if (!Number.isFinite(rawFrom)) {
    logNonFiniteGuard("writeScrollTop:from", rawFrom, {
      scroller: describeElement(scroller),
      reason
    });
  }
  const rawTop = Number(top);
  if (!Number.isFinite(rawTop)) {
    logNonFiniteGuard("writeScrollTop:target", top, {
      scroller: describeElement(scroller),
      reason
    });
    return;
  }
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const target = Math.max(0, Math.min(rawTop, maxTop));
  const delta = target - from;
  withWriteEnabled(reason, delta, () => {
    scroller.scrollTop = target;
  });
  const after = readScrollTop(scroller);
  logWriteMismatch(scroller, target, from, after, reason);
}
function resolveSeekTarget(blockIdx) {
  const blocks = getAsrBlockElements();
  const el = blocks[blockIdx];
  if (!el) return null;
  const scroller = findScroller(el);
  const mode = getScrollMode();
  const blockTopPx = elementTopRelativeTo(el, scroller);
  if (!Number.isFinite(blockTopPx)) {
    logNonFiniteGuard("resolveSeekTarget:blockTopPx", blockTopPx, { blockIdx });
    return null;
  }
  const top = mode === "asr" ? blockTopPx : blockTopPx - markerOffsetPx(scroller);
  if (!Number.isFinite(top)) {
    logNonFiniteGuard("resolveSeekTarget:top", top, { blockIdx, mode });
    return null;
  }
  let lineIdx = null;
  try {
    const firstLine = el.querySelector(".line[data-line], .line[data-line-idx], .line");
    const rawIdx = firstLine?.dataset?.line ?? firstLine?.dataset?.lineIdx;
    const parsed = Number(rawIdx);
    if (Number.isFinite(parsed)) lineIdx = Math.max(0, Math.floor(parsed));
  } catch {
    lineIdx = null;
  }
  return { blockEl: el, scroller, top, blockTopPx, lineIdx };
}
function resolveSeekLineHeightPx(target) {
  const lineEl = target.blockEl.querySelector(".line[data-line], .line[data-line-idx], .line");
  const lineRectH = lineEl?.getBoundingClientRect?.().height ?? 0;
  if (Number.isFinite(lineRectH) && lineRectH > 4) return lineRectH;
  const lineOffsetH = lineEl?.offsetHeight ?? 0;
  if (Number.isFinite(lineOffsetH) && lineOffsetH > 4) return lineOffsetH;
  try {
    const computed = lineEl ? Number.parseFloat(getComputedStyle(lineEl).lineHeight) : Number.NaN;
    if (Number.isFinite(computed) && computed > 4) return computed;
  } catch {
  }
  const scrollerRectH = target.scroller.getBoundingClientRect?.().height ?? 0;
  if (Number.isFinite(scrollerRectH) && scrollerRectH > 0) {
    return Math.max(24, Math.min(96, scrollerRectH * 0.09));
  }
  return 56;
}
function getScrollWriter() {
  if (cached) return cached;
  if (typeof window !== "undefined") {
    const maybe = window.__tpScrollWrite;
    if (typeof maybe === "function") {
      const fn = maybe;
      const getScroller = () => getRuntimeScroller(resolveViewerRole()) || getScrollerEl("main") || getScrollerEl("display") || getDisplayViewerElement();
      cached = {
        scrollTo(top) {
          try {
            const sc = getScroller();
            const cur = sc ? sc.scrollTop || 0 : 0;
            const next = Number(top) || 0;
            withWriteEnabled("scrollTo", next - cur, () => fn(next));
          } catch {
          }
        },
        scrollBy(delta) {
          try {
            const sc = getScroller();
            const cur = sc ? sc.scrollTop || 0 : 0;
            const d = Number(delta) || 0;
            withWriteEnabled("scrollBy", d, () => fn(cur + d));
          } catch {
          }
        },
        ensureVisible(_top, _paddingPx) {
        }
      };
      return cached;
    }
    if (maybe && typeof maybe === "object") {
      const w2 = maybe;
      if (typeof w2.scrollTo === "function" && typeof w2.scrollBy === "function") {
        const writerImpl = w2;
        cached = {
          scrollTo(top, opts) {
            try {
              withWriteEnabled("scrollTo", estimateDelta(top), () => writerImpl.scrollTo(top, opts));
            } catch {
            }
          },
          scrollBy(delta, opts) {
            try {
              withWriteEnabled("scrollBy", Number(delta) || 0, () => writerImpl.scrollBy(delta, opts));
            } catch {
            }
          },
          ensureVisible(top, paddingPx = 80) {
            try {
              if (typeof writerImpl.ensureVisible === "function") {
                withWriteEnabled("ensureVisible", estimateDelta(top), () => writerImpl.ensureVisible(top, paddingPx));
              } else {
                const next = Math.max(0, top - paddingPx);
                withWriteEnabled("ensureVisible", estimateDelta(next), () => writerImpl.scrollTo(next, { behavior: "auto" }));
              }
            } catch {
            }
          }
        };
        return cached;
      }
    }
  }
  if (!warned) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      try {
        console.warn("[scroll-writer] __tpScrollWrite missing or incomplete; scroll commands are no-ops.");
      } catch {
      }
    }
    warned = true;
  }
  cached = {
    scrollTo() {
    },
    scrollBy() {
    },
    ensureVisible() {
    }
  };
  return cached;
}
function seekToBlock(blockIdx, reason) {
  cancelSeekAnimation();
  const target = resolveSeekTarget(blockIdx);
  if (!target) return;
  const { scroller, top, blockTopPx, lineIdx } = target;
  try {
    if (shouldVerboseWrites()) {
      const currentScrollTop = readScrollTop(scroller);
      try {
        console.log("[scroll-writer] seek target", {
          blockIdx,
          lineIdx,
          blockTopPx: Math.round(blockTopPx),
          currentScrollTop: Math.round(currentScrollTop),
          targetTop: Math.round(top),
          deltaPx: Math.round(top - currentScrollTop),
          reason: reason || "seekToBlock"
        });
      } catch {
      }
    }
    writeScrollTop(scroller, top, reason || "seekToBlock");
    try {
      if (reason && typeof console !== "undefined") {
        console.debug?.("[scroll-writer] seekToBlock", { blockIdx, reason });
      }
    } catch {
    }
  } catch {
  }
}
function seekToBlockAnimated(blockIdx, reason, opts = {}) {
  cancelSeekAnimation();
  const runId = activeSeekAnimRunId;
  const mode = getScrollMode();
  const forceAnimated = opts.forceAnimated === true;
  if (!forceAnimated && mode !== "asr" || !forceAnimated && prefersReducedMotion()) {
    seekToBlock(blockIdx, reason);
    return;
  }
  const target = resolveSeekTarget(blockIdx);
  if (!target) return;
  const { scroller, top: blockTargetTop, blockTopPx, lineIdx } = target;
  const startTop = readScrollTop(scroller);
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const requestedTopRaw = Number(opts.targetTop);
  const hasRequestedTop = Number.isFinite(requestedTopRaw);
  const targetTop = hasRequestedTop ? Math.max(0, Math.min(requestedTopRaw, maxTop)) : blockTargetTop;
  const lineHeightPx = resolveSeekLineHeightPx(target);
  const configuredMaxPxPerSecond = Number(opts.maxPxPerSecond);
  const baseMaxPxPerSecond = Number.isFinite(configuredMaxPxPerSecond) && configuredMaxPxPerSecond > 0 ? configuredMaxPxPerSecond : lineHeightPx * ASR_SEEK_DEFAULT_LINES_PER_SEC;
  const viewportMaxPxPerSecond = Math.max(
    ASR_SEEK_MIN_PX_PER_SEC,
    (scroller.clientHeight || 0) * ASR_SEEK_MAX_VIEWPORTS_PER_SEC
  );
  const maxPxPerSecond = Math.max(
    ASR_SEEK_MIN_PX_PER_SEC,
    Math.min(baseMaxPxPerSecond, ASR_SEEK_MAX_PX_PER_SEC, viewportMaxPxPerSecond)
  );
  const minDurationMsRaw = Number(opts.minDurationMs);
  const maxDurationMsRaw = Number(opts.maxDurationMs);
  const minDurationMs = Number.isFinite(minDurationMsRaw) && minDurationMsRaw > 0 ? minDurationMsRaw : ASR_SEEK_MIN_DURATION_MS;
  const maxDurationMs = Number.isFinite(maxDurationMsRaw) && maxDurationMsRaw > minDurationMs ? maxDurationMsRaw : Math.max(minDurationMs, ASR_SEEK_MAX_DURATION_MS);
  const deltaPx = targetTop - startTop;
  if (shouldVerboseWrites()) {
    try {
      console.log("[scroll-writer] seek target", {
        blockIdx,
        lineIdx,
        blockTopPx: Math.round(blockTopPx),
        lineHeightPx: Math.round(lineHeightPx),
        currentScrollTop: Math.round(startTop),
        targetTop: Math.round(targetTop),
        requestedTop: hasRequestedTop ? Math.round(requestedTopRaw) : null,
        maxPxPerSecond: Math.round(maxPxPerSecond),
        deltaPx: Math.round(deltaPx),
        reason: reason || "seekToBlockAnimated"
      });
    } catch {
    }
  }
  if (!Number.isFinite(targetTop) || Math.abs(deltaPx) < ASR_SEEK_EPSILON_PX) {
    writeScrollTop(scroller, targetTop, reason || "seekToBlockAnimated");
    return;
  }
  const durationMs = Math.max(
    minDurationMs,
    Math.min(maxDurationMs, Math.abs(deltaPx) / maxPxPerSecond * 1e3)
  );
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  let cancelled = false;
  activeSeekAnim = {
    cancel() {
      cancelled = true;
      activeSeekAnim = null;
    }
  };
  const tick = (now2) => {
    if (cancelled || runId !== activeSeekAnimRunId) return;
    const elapsed = now2 - start;
    const t = Math.max(0, Math.min(1, elapsed / durationMs));
    const eased = easeInOutCubic(t);
    const next = startTop + (targetTop - startTop) * eased;
    writeScrollTop(scroller, next, reason || "seekToBlockAnimated");
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      if (runId === activeSeekAnimRunId) {
        activeSeekAnim = null;
      }
    }
  };
  requestAnimationFrame(tick);
}

// src/scroll/scroll-intent-bus.ts
var EVENT = "tp:scroll:intent";
function onScrollIntent(cb) {
  const h = (e) => cb(e.detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// src/boot/scheduler.ts
var writeQueue = [];
var readQueue = [];
var rafId = 0;
function flush() {
  rafId = 0;
  const writes = writeQueue;
  const reads = readQueue;
  writeQueue = [];
  readQueue = [];
  for (const fn of writes) {
    try {
      fn();
    } catch (e) {
      try {
        console.error("[scheduler] write error", e);
      } catch {
      }
    }
  }
  for (const fn of reads) {
    try {
      fn();
    } catch (e) {
      try {
        console.error("[scheduler] read error", e);
      } catch {
      }
    }
  }
}
function ensureRaf() {
  if (rafId) return;
  rafId = requestAnimationFrame(flush);
}
function requestWrite(fn) {
  writeQueue.push(fn);
  ensureRaf();
}
function requestRead(fn) {
  readQueue.push(fn);
  ensureRaf();
}
try {
  const maybe = window.__tpScrollWrite;
  if (typeof maybe === "function") {
    window.__tpScrollWrite = {
      scrollTo(y) {
        try {
          maybe(y);
        } catch {
        }
      },
      scrollBy(dy) {
        try {
          maybe((Number(dy) || 0) + 0);
        } catch {
        }
      }
    };
  }
} catch {
}
try {
  if (typeof window !== "undefined") {
    window.__tpRequestWrite = requestWrite;
    window.__tpRequestRead = requestRead;
  }
} catch {
}

// src/ui/typography-ssot.ts
var DEFAULT_SCRIPT_FONT_PX = 40;

// src/scroll/scroll-helpers.ts
var defaultViewer = () => document.getElementById("viewer") || document.querySelector('[data-role="viewer"]');
var SCROLL_CALLER_HINTS = [
  ["asr-scroll-driver", "ASR"],
  ["hybrid-wpm-motor", "Hybrid"],
  ["auto-motor", "Auto"],
  ["scroll-router", "Router"],
  ["autoscroll", "Auto"]
];
function shouldLogScrollWrite2() {
  try {
    const w2 = window;
    if (w2.__tpScrollDebug === true) return true;
    if (w2.__tpScrollWriteDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || "");
    if (qs.has("scrollDebug") || qs.has("scrollWriteDebug")) return true;
  } catch {
  }
  return false;
}
function detectScrollCaller() {
  try {
    const trace = (new Error().stack || "").toLowerCase();
    for (const [hint, tag] of SCROLL_CALLER_HINTS) {
      if (trace.includes(hint)) return tag;
    }
  } catch {
  }
  return "unknown";
}
function logScrollWrite(payload) {
  try {
    console.info("[SCROLL_WRITE]", payload);
  } catch {
  }
}
function readLineIndex2(el) {
  if (!el) return null;
  const line = el.closest ? el.closest(".line") : null;
  if (!line) return null;
  const raw = line.dataset.i || line.dataset.index || line.dataset.lineIdx || line.dataset.line || line.getAttribute("data-line") || line.getAttribute("data-line-idx");
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const id = line.id || "";
  const m = /^tp-line-(\d+)$/.exec(id);
  if (m) return Math.max(0, Number(m[1]));
  return null;
}
function computeAnchorLineIndex2(scroller = defaultViewer()) {
  if (!scroller) return null;
  const rect = scroller.getBoundingClientRect();
  if (!rect.height || !rect.width) return null;
  const markerPct = typeof window.__TP_MARKER_PCT === "number" ? window.__TP_MARKER_PCT : 0.4;
  const markerY = rect.top + rect.height * markerPct;
  const markerX = rect.left + rect.width * 0.5;
  const hit = document.elementFromPoint(markerX, markerY);
  const hitIdx = readLineIndex2(hit);
  if (hitIdx != null) return hitIdx;
  const lines = Array.from(scroller.querySelectorAll(".line"));
  if (!lines.length) return null;
  let bestIdx = null;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const el = lines[i];
    const r = el.getBoundingClientRect();
    const y = r.top + r.height * 0.5;
    const d = Math.abs(y - markerY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = readLineIndex2(el) ?? i;
    }
  }
  return bestIdx != null ? Math.max(0, Math.floor(bestIdx)) : null;
}
var clampGuard = (target, max) => {
  try {
    const guard = window.__tpClampGuard;
    if (typeof guard === "function") return !!guard(target, max);
  } catch {
  }
  return true;
};
function clampActive() {
  try {
    return window.__tpClampActive === true;
  } catch {
    return false;
  }
}
function clampScrollTop(sc, y) {
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const t = Math.max(0, Math.min(Number(y) || 0, max));
  const allowed = clampGuard(t, max);
  return { target: allowed ? t : sc.scrollTop || 0, guardDenied: !allowed, max };
}
function mirrorToDisplay(sc) {
  try {
    const send = window.sendToDisplay;
    if (typeof send !== "function") return;
    const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
    const top = sc.scrollTop || 0;
    const ratio = max > 0 ? top / max : 0;
    const cursorLine = computeAnchorLineIndex2(sc);
    send({
      type: "scroll",
      top,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? void 0
    });
  } catch {
  }
}
function scrollByPx(dy, getScroller = defaultViewer) {
  const logEnabled = shouldLogScrollWrite2();
  const caller = logEnabled ? detectScrollCaller() : "unknown";
  if (clampActive()) {
    if (logEnabled) {
      logScrollWrite({ caller, target: Number(dy) || 0, current: 0, accepted: false, reason: "clamp-active" });
    }
    return;
  }
  const sc = getScroller();
  if (!sc) {
    if (logEnabled) {
      logScrollWrite({ caller, target: Number(dy) || 0, current: 0, accepted: false, reason: "no-scroller" });
    }
    return;
  }
  const current = sc.scrollTop || 0;
  const { target, guardDenied } = clampScrollTop(sc, current + (Number(dy) || 0));
  if (guardDenied) {
    if (logEnabled) {
      logScrollWrite({ caller, target, current, accepted: false, reason: "clamp-guard" });
    }
    return;
  }
  if (logEnabled) {
    logScrollWrite({ caller, target, current, accepted: true, reason: "scrollByPx" });
  }
  requestWrite(() => {
    try {
      sc.scrollTop = target;
    } catch {
    }
    mirrorToDisplay(sc);
    try {
      const win = window;
      const debug = win?.__tpScrollDebug === true || /scrollDebug=1/i.test(String(location.search || ""));
      if (debug) {
        const mode = win.__tpScrollMode && typeof win.__tpScrollMode.getMode === "function" ? win.__tpScrollMode.getMode() : void 0;
        const maxScrollTop = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
        win.HUD?.log?.("scroll-commit", {
          mode,
          delta: dy,
          targetTop: target,
          currentTop: sc.scrollTop,
          maxScrollTop
        });
      }
      try {
        window.dispatchEvent(new CustomEvent("tp:scroll:commit", {
          detail: {
            delta: dy,
            targetTop: target,
            currentTop: sc.scrollTop,
            maxScrollTop: Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0))
          }
        }));
      } catch {
      }
    } catch {
    }
  });
}
function getViewportMetrics(getScroller = defaultViewer) {
  const sc = getScroller();
  const root = document.documentElement;
  const cs = root ? getComputedStyle(root) : null;
  const fontSize = cs ? parseFloat(cs.getPropertyValue("--tp-font-size")) || DEFAULT_SCRIPT_FONT_PX : DEFAULT_SCRIPT_FONT_PX;
  const lineHeight = cs ? parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4 : 1.4;
  const pxPerLine = fontSize * lineHeight;
  const pxPerWord = pxPerLine / 6;
  if (!sc) {
    return {
      scrollTop: 0,
      viewportHeight: 0,
      scrollHeight: 0,
      pxPerLine,
      pxPerWord
    };
  }
  return {
    scrollTop: sc.scrollTop || 0,
    viewportHeight: sc.clientHeight || 0,
    height: sc.clientHeight || 0,
    scrollHeight: sc.scrollHeight || 0,
    pxPerLine,
    pxPerWord
  };
}

// src/scroll/asr-block-completion.ts
var DEFAULT_COMPLETION_POLICY = {
  minCoverageFinal: 0.7,
  minCoverageNoFinal: 0.85,
  trailingLinesWindow: 3,
  minTrailingLinesMatched: 2,
  requireBoundaryCross: false
};
var clamp01 = (value) => Math.min(1, Math.max(0, value));
function decideBlockCompletion(e, policy = {}) {
  const resolved = { ...DEFAULT_COMPLETION_POLICY, ...policy };
  const totalLines = Number.isFinite(e.totalLinesInBlock) ? e.totalLinesInBlock : 0;
  if (totalLines <= 0) {
    return { ok: false, status: "unknown", reason: "insufficient_evidence" };
  }
  if (resolved.requireBoundaryCross && !e.boundaryCrossed) {
    return { ok: false, status: "incomplete", reason: "no_boundary" };
  }
  const coverage = clamp01(Number(e.coverageRatio) || 0);
  const trailingMatched = Number.isFinite(e.matchedTrailingLines) ? e.matchedTrailingLines : 0;
  if (!e.hasFinal) {
    if (coverage >= resolved.minCoverageNoFinal) {
      const confidence = clamp01(coverage);
      return { ok: true, status: "complete", reason: "complete", confidence };
    }
    return { ok: false, status: "unknown", reason: "not_final" };
  }
  if (e.matchedLastLine) {
    let confidence = clamp01(coverage + 0.2);
    if (trailingMatched >= resolved.minTrailingLinesMatched) confidence = clamp01(confidence + 0.1);
    return { ok: true, status: "complete", reason: "complete", confidence };
  }
  if (trailingMatched >= resolved.minTrailingLinesMatched) {
    const confidence = clamp01(coverage + 0.1);
    return { ok: true, status: "complete", reason: "complete", confidence };
  }
  if (coverage >= resolved.minCoverageFinal) {
    const confidence = clamp01(coverage);
    return { ok: true, status: "complete", reason: "complete", confidence };
  }
  if (trailingMatched <= 0) {
    return { ok: false, status: "incomplete", reason: "incomplete_last_line" };
  }
  return { ok: false, status: "incomplete", reason: "incomplete_coverage" };
}

// src/scroll/autoscroll.ts
var DEFAULT_SPEED_PX_PER_SEC = 21;
var MIN_SPEED_PX_PER_SEC = 1;
var MAX_SPEED_PX_PER_SEC = 60;
function readStoredSpeed() {
  const keys = ["tp_autoScrollPx", "tp_auto_speed"];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0) return v;
    } catch {
    }
  }
  return DEFAULT_SPEED_PX_PER_SEC;
}
function clampSpeed(px) {
  const v = Number(px) || DEFAULT_SPEED_PX_PER_SEC;
  return Math.max(MIN_SPEED_PX_PER_SEC, Math.min(MAX_SPEED_PX_PER_SEC, v));
}
function createTimedEngine(brain) {
  let active = false;
  let speed = clampSpeed(readStoredSpeed());
  const apply = () => {
    if (!brain) return;
    const v = Number(speed);
    brain.setTargetSpeed(Number.isFinite(v) ? v : DEFAULT_SPEED_PX_PER_SEC);
  };
  return {
    enable: () => {
      active = true;
      apply();
    },
    disable: () => {
      active = false;
      try {
        brain.setTargetSpeed(0);
      } catch {
      }
    },
    setSpeedPxPerSec: (px) => {
      const v = clampSpeed(px);
      if (!Number.isFinite(v) || v <= 0) return;
      speed = v;
      if (active) apply();
    }
  };
}

// src/scroll/scroll-brain.ts
var now = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
var debugEnabled = false;
var debugCounter = 0;
var isScrollDebug = () => {
  try {
    const w2 = window;
    if (w2.__tpScrollDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || "");
    if (qs.has("scrollDebug")) return true;
  } catch {
  }
  return false;
};
function createScrollBrain() {
  const PLL_GAIN = 0.4;
  const PLL_SMOOTH = 0.12;
  const state3 = {
    mode: "rehearsal",
    ticking: false,
    rafId: null,
    lastTickTs: null,
    pll: {
      errPx: 0,
      lastErrTs: 0,
      smoothedErr: 0,
      gain: PLL_GAIN,
      smoothFactor: PLL_SMOOTH
    },
    silence: {
      isSilent: false,
      lastChangeTs: now()
    },
    targetSpeedPxPerSec: 0,
    effectiveSpeedPxPerSec: 0,
    pxPerLine: 0,
    pxPerWord: 0,
    manualNudgePx: 0,
    lastCenteredLine: null
  };
  const resetForMode = (mode) => {
    state3.pll = { errPx: 0, lastErrTs: now(), smoothedErr: 0, gain: PLL_GAIN, smoothFactor: PLL_SMOOTH };
    state3.silence = { isSilent: false, lastChangeTs: now() };
    state3.targetSpeedPxPerSec = 0;
    state3.effectiveSpeedPxPerSec = 0;
    state3.manualNudgePx = 0;
    state3.lastCenteredLine = null;
    state3.mode = mode;
  };
  const tick = (ts) => {
    if (!state3.ticking) {
      state3.rafId = null;
      return;
    }
    if (!debugEnabled) debugEnabled = isScrollDebug();
    const last = state3.lastTickTs ?? ts;
    const dtMs = ts - last;
    state3.lastTickTs = ts;
    const dtSec = dtMs > 0 ? dtMs / 1e3 : 0;
    const mode = state3.mode;
    const base = state3.targetSpeedPxPerSec || 0;
    let effectiveSpeed = base;
    const isClamped = clampActive();
    const silenceHold = mode === "hybrid" && state3.silence.isSilent;
    if (mode === "hybrid" && !silenceHold) {
      effectiveSpeed += state3.pll.smoothedErr * state3.pll.gain;
    }
    if (mode === "hybrid" && silenceHold) {
      effectiveSpeed = 0;
    }
    if (isClamped) {
      effectiveSpeed = 0;
    }
    if (effectiveSpeed < 0 || !Number.isFinite(effectiveSpeed)) effectiveSpeed = 0;
    state3.effectiveSpeedPxPerSec = effectiveSpeed;
    let dy = effectiveSpeed * dtSec;
    if (state3.manualNudgePx) {
      dy += state3.manualNudgePx;
      state3.manualNudgePx = 0;
    }
    if (Number.isFinite(dy) && dy !== 0 && !isClamped) {
      scrollByPx(dy);
    }
    if (!debugEnabled) {
      debugEnabled = isScrollDebug();
    }
    if (debugEnabled) {
      debugCounter++;
      if (debugCounter >= 30) {
        debugCounter = 0;
        try {
          console.log("[scroll-brain]", {
            mode,
            target: state3.targetSpeedPxPerSec || 0,
            effective: effectiveSpeed,
            clamp: isClamped,
            silent: state3.silence.isSilent,
            pllErr: state3.pll?.smoothedErr ?? 0
          });
        } catch {
        }
      }
    }
    state3.rafId = typeof requestAnimationFrame === "function" ? requestAnimationFrame(tick) : null;
  };
  const startEngine = () => {
    if (state3.ticking) return;
    state3.ticking = true;
    state3.lastTickTs = null;
    state3.rafId = typeof requestAnimationFrame === "function" ? requestAnimationFrame(tick) : null;
  };
  const stopEngine = () => {
    state3.ticking = false;
    if (state3.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state3.rafId);
    }
    state3.rafId = null;
    state3.lastTickTs = null;
  };
  const setMode = (mode) => {
    if (state3.mode === mode) return;
    stopEngine();
    resetForMode(mode);
  };
  const getMode = () => state3.mode;
  const setTargetSpeed = (pxPerSec) => {
    const v = Number(pxPerSec);
    state3.targetSpeedPxPerSec = Number.isFinite(v) && v > 0 ? v : 0;
  };
  const setMetrics = (pxPerLine, pxPerWord) => {
    const line = Number(pxPerLine);
    const word = Number(pxPerWord);
    if (Number.isFinite(line) && line > 0) state3.pxPerLine = line;
    if (Number.isFinite(word) && word > 0) state3.pxPerWord = word;
  };
  const reportAsrSample = (sample) => {
    if (state3.mode !== "hybrid") return;
    if (!sample || typeof sample.errPx !== "number") return;
    const ts = typeof sample.ts === "number" ? sample.ts : now();
    state3.pll.errPx = sample.errPx;
    state3.pll.lastErrTs = ts;
    const alpha = state3.pll.smoothFactor;
    state3.pll.smoothedErr = state3.pll.smoothedErr * (1 - alpha) + sample.errPx * alpha;
  };
  const reportAsrSilence = (isSilent, ts) => {
    state3.silence.isSilent = !!isSilent;
    state3.silence.lastChangeTs = typeof ts === "number" ? ts : now();
  };
  const centerOnLine = (lineIndex) => {
    state3.lastCenteredLine = Number.isFinite(lineIndex) ? Math.max(0, Math.floor(lineIndex)) : null;
  };
  const onSpeechSample = (sample) => {
    try {
      reportAsrSample(sample);
    } catch {
    }
  };
  const nudge = (deltaPx) => {
    const delta = Number(deltaPx);
    if (!Number.isFinite(delta) || delta === 0) return;
    state3.manualNudgePx += delta;
  };
  return {
    setMode,
    getMode,
    startEngine,
    stopEngine,
    setTargetSpeed,
    setMetrics,
    reportAsrSample,
    reportAsrSilence,
    centerOnLine,
    onSpeechSample,
    nudge,
    // Legacy shims
    setBaseSpeedPx: (px) => {
      const val = Number(px);
      if (Number.isFinite(val)) {
        state3.targetSpeedPxPerSec = val;
        state3.effectiveSpeedPxPerSec = val;
      }
    },
    onManualSpeedAdjust: (delta) => {
      const d = Number(delta);
      if (Number.isFinite(d)) {
        state3.targetSpeedPxPerSec += d;
      }
    },
    getCurrentSpeedPx: () => state3.effectiveSpeedPxPerSec
  };
}

// src/scroll/brain-access.ts
var scrollBrain = null;
function ensureScrollBrain() {
  if (!scrollBrain) {
    scrollBrain = createScrollBrain();
    try {
      window.__tpScrollBrain = scrollBrain;
    } catch {
    }
  }
  return scrollBrain;
}
function getScrollBrain() {
  return ensureScrollBrain();
}

// src/features/scroll/hybrid-wpm-motor.ts
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function createHybridWpmMotor(deps) {
  let running = false;
  let velocityPxPerSec = 0;
  let rafId2 = null;
  let lastNow = null;
  let lastTickLog = 0;
  let writer = null;
  let warnedNoWriter = false;
  let warnedNoOverflow = false;
  let loggedFirstMove = false;
  let lastMoveAtMs = 0;
  let lastDtClampLogAtMs = 0;
  let posFloat = null;
  const TICK_LOG_INTERVAL_MS = 1e3;
  const DT_CLAMP_LOG_INTERVAL_MS = 250;
  const now2 = deps.now ?? (() => performance.now());
  const raf = deps.raf ?? ((cb) => window.requestAnimationFrame(cb));
  const caf = deps.caf ?? ((id) => window.cancelAnimationFrame(id));
  const log = deps.log ?? (() => {
  });
  const recordMove = (prevTop, nextTop) => {
    const delta = Math.abs(nextTop - prevTop);
    if (delta > 0.25 && !loggedFirstMove) {
      loggedFirstMove = true;
      try {
        console.warn("[HYBRID] first move", { prevTop, nextTop, max: writer ? Math.max(0, writer.scrollHeight - writer.clientHeight) : -1 });
      } catch {
      }
    }
    if (delta > 0) {
      lastMoveAtMs = now2();
    }
  };
  const resetAccumulatorFromDom = () => {
    posFloat = writer ? writer.scrollTop || 0 : null;
  };
  const tick = () => {
    if (!running) return;
    const current = now2();
    const prev = lastNow ?? current;
    const deltaMs = current - prev;
    const dt = clamp(deltaMs / 1e3, 0, 0.2);
    if (deltaMs > 200) {
      if (current - lastDtClampLogAtMs >= DT_CLAMP_LOG_INTERVAL_MS) {
        lastDtClampLogAtMs = current;
        log("dt-clamp", {
          dtRaw: deltaMs / 1e3,
          dtClamped: dt
        });
      }
    }
    lastNow = current;
    if (velocityPxPerSec !== 0) {
      if (!writer) {
        if (!warnedNoWriter) {
          warnedNoWriter = true;
          try {
            console.error("[HYBRID] no writer");
          } catch {
          }
        }
        stop();
        return;
      }
      const max = Math.max(0, writer.scrollHeight - writer.clientHeight);
      if (max <= 0) {
        if (!warnedNoOverflow) {
          warnedNoOverflow = true;
          try {
            console.warn("[HYBRID] nothing to scroll", { sh: writer.scrollHeight, h: writer.clientHeight });
          } catch {
          }
        }
        rafId2 = raf(tick);
        return;
      }
      const prevTop = writer.scrollTop || 0;
      if (posFloat == null) {
        posFloat = prevTop;
      }
      posFloat += velocityPxPerSec * dt;
      posFloat = clamp(posFloat, 0, max);
      const nextTop = posFloat;
      try {
        writer.scrollTop = nextTop;
      } catch (err) {
        log("tick:scroll", err);
      }
      recordMove(prevTop, nextTop);
      const tickNow = now2();
      if (tickNow - lastTickLog >= TICK_LOG_INTERVAL_MS) {
        lastTickLog = tickNow;
        log("tick", {
          dt,
          velocityPxPerSec,
          prevTop,
          nextTop,
          maxTop: max,
          hasWriter: !!writer
        });
      }
    }
    rafId2 = raf(tick);
  };
  return {
    start() {
      if (running || rafId2 != null) {
        return { started: false, reason: "already-running" };
      }
      running = true;
      loggedFirstMove = false;
      lastMoveAtMs = 0;
      resetAccumulatorFromDom();
      lastNow = now2();
      rafId2 = raf(tick);
      log("start", { velocityPxPerSec });
      return { started: true };
    },
    stop() {
      if (!running) return;
      running = false;
      if (rafId2 != null) {
        caf(rafId2);
        rafId2 = null;
      }
      lastNow = null;
      loggedFirstMove = false;
      lastMoveAtMs = 0;
      posFloat = null;
      log("stop", {});
    },
    setVelocityPxPerSec(pxPerSec) {
      velocityPxPerSec = pxPerSec;
      log("velocity", { velocityPxPerSec });
    },
    isRunning() {
      return running;
    },
    setWriter(el) {
      writer = el;
      resetAccumulatorFromDom();
      if (writer) {
        warnedNoWriter = false;
        warnedNoOverflow = false;
      }
    },
    movedRecently(nowArg) {
      const check = typeof nowArg === "number" ? nowArg : now2();
      return lastMoveAtMs > 0 && check - lastMoveAtMs < 250;
    }
  };
}

// src/features/scroll/auto-state.ts
var STORAGE_KEY = "tp_auto_enabled_v1";
function persistStoredAutoEnabled(enabled) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

// src/scroll/audit.ts
var EXPECTED_WRITERS = /* @__PURE__ */ new Set([
  "ui/applyUiScrollMode",
  "features/scroll/mode-router",
  "scroll/mode-router",
  "state/app-store"
]);
var CONTINUOUS_MODES = /* @__PURE__ */ new Set(["timed", "wpm", "hybrid", "asr"]);
var FORBIDDEN_PHASES = /* @__PURE__ */ new Set(["idle", "preroll"]);
var RACE_WINDOW_MS = 150;
var writerStack = [];
var lastWriteAt = 0;
var lastWriter = "";
var lastMode = "";
var lastPhase = "";
function auditEnabled() {
  try {
    const w2 = window;
    if (w2?.__TP_DEV || w2?.__TP_DEV1 || w2?.__tpDevMode) return true;
    if (w2?.localStorage?.getItem?.("tp_dev_mode") === "1") return true;
    if (typeof location !== "undefined" && location.search.includes("dev=1")) return true;
  } catch {
  }
  return false;
}
function getScrollModeAuditContext() {
  if (!auditEnabled()) return null;
  return writerStack.length ? writerStack[writerStack.length - 1] : null;
}
function isContinuousMode(mode) {
  return CONTINUOUS_MODES.has(mode);
}
function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
function emitUnexpected(label, payload) {
  try {
    console.warn(`[scroll-audit] UNEXPECTED ${label}`, payload);
  } catch {
  }
}
function recordScrollModeWrite(event) {
  if (!auditEnabled()) return;
  const now2 = Date.now();
  const writer = event.writer || "unknown";
  const from = normalize(event.from);
  const to = normalize(event.to);
  if (!to || to === from) return;
  const phase = normalize(event.phase);
  const reasons = [];
  if (!EXPECTED_WRITERS.has(writer)) reasons.push("unexpected-writer");
  if (FORBIDDEN_PHASES.has(phase) && isContinuousMode(to)) reasons.push("forbidden-phase");
  const deltaMs = lastWriteAt ? now2 - lastWriteAt : 0;
  if (lastWriteAt && deltaMs < RACE_WINDOW_MS) reasons.push("rapid-write");
  if (reasons.length > 0) {
    const payload = {
      reasons,
      writer,
      from,
      to,
      phase: phase || "unknown",
      deltaMs: lastWriteAt ? deltaMs : null,
      lastWriter: lastWriter || null,
      lastMode: lastMode || null,
      lastPhase: lastPhase || null
    };
    if (event.source) payload.source = event.source;
    if (event.via) payload.via = event.via;
    if (event.stack) {
      try {
        payload.stack = new Error().stack;
      } catch {
      }
    }
    emitUnexpected("scrollMode-write", payload);
  }
  lastWriteAt = now2;
  lastWriter = writer;
  lastMode = to;
  lastPhase = phase;
}

// src/features/scroll/scroll-prefs.ts
var CANONICAL_KEY = "scrollMode";
var LEGACY_KEYS = ["tp_scroll_prefs_v1", "tp_scroll_mode_v1", "tp_scroll_mode"];
function normalizeMode(mode) {
  const v = String(mode || "").toLowerCase();
  if (v === "manual") return "step";
  const allowed = ["hybrid", "timed", "wpm", "asr", "step", "rehearsal"];
  return allowed.includes(v) ? v : null;
}
function safeParse(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const normalized = normalizeMode(parsed.mode);
    if (!normalized) return null;
    return { mode: normalized };
  } catch {
    return null;
  }
}
function readLegacyMode(key, raw) {
  if (!raw) return null;
  if (key === "tp_scroll_prefs_v1") {
    return safeParse(raw)?.mode ?? null;
  }
  return normalizeMode(raw);
}
function cleanLegacyKeys(storage) {
  LEGACY_KEYS.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
    }
  });
}
function migrateLegacyScrollMode() {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const canonical = normalizeMode(storage.getItem(CANONICAL_KEY));
    if (canonical) {
      cleanLegacyKeys(storage);
      return canonical;
    }
    for (const key of LEGACY_KEYS) {
      const legacy = readLegacyMode(key, storage.getItem(key));
      if (legacy) {
        storage.setItem(CANONICAL_KEY, legacy);
        cleanLegacyKeys(storage);
        return legacy;
      }
    }
    cleanLegacyKeys(storage);
  } catch {
  }
  return null;
}
function loadScrollPrefs() {
  try {
    if (typeof window === "undefined") return null;
    const mode = migrateLegacyScrollMode();
    if (!mode) return null;
    return { mode };
  } catch {
    return null;
  }
}
function saveScrollPrefs(next) {
  try {
    if (typeof window === "undefined") return;
    const normalized = normalizeMode(next?.mode || null);
    if (!normalized) return;
    window.localStorage.setItem(CANONICAL_KEY, normalized);
    cleanLegacyKeys(window.localStorage);
  } catch {
  }
}

// src/state/app-store.ts
var IS_TEST = typeof process !== "undefined" && process.env && false;
var DEVICE_KEY = "tp_mic_device_v1";
var OBS_ENABLED_KEY = "tp_obs_enabled";
var OBS_HOST_KEY = "tp_obs_host";
var OBS_PASSWORD_KEY = "tp_obs_password";
var OBS_SCENE_KEY = "tp_obs_scene";
var OBS_RECONNECT_KEY = "tp_obs_reconnect";
var AUTO_RECORD_KEY = "tp_auto_record_on_start_v1";
var LEGACY_AUTO_RECORD_KEY = "tp_auto_record";
var PREROLL_SEC_KEY = "tp_preroll_seconds";
var DEV_HUD_KEY = "tp_dev_hud";
var SETTINGS_TAB_KEY = "tp_settings_tab";
var LEGACY_ASR_SETTINGS_KEY = "tp_asr_settings_v1";
var ASR_ENGINE_KEY = "tp_asr_engine_v1";
var ASR_LANG_KEY = "tp_asr_language_v1";
var ASR_INTERIM_KEY = "tp_asr_interim_v1";
var ASR_FILTER_KEY = "tp_asr_filter_v1";
var ASR_THRESHOLD_KEY = "tp_asr_threshold_v1";
var ASR_ENDPOINT_KEY = "tp_asr_endpoint_v1";
var ASR_PROFILES_KEY = "tp_asr_profiles_v1";
var ASR_ACTIVE_PROFILE_KEY = "tp_asr_active_profile_v1";
var SINGLE_MONITOR_READ_KEY = "tp_single_monitor_read_v1";
var ASR_CALM_MODE_KEY = "tp_asr_calm_mode_v1";
var ASR_TUNING_PROFILES_KEY = "tp_asr_tuning_profiles_v1";
var ASR_TUNING_ACTIVE_PROFILE_KEY = "tp_asr_tuning_active_profile_v1";
var SCROLL_MODE_KEY = "scrollMode";
var TIMED_SPEED_KEY = "tp_scroll_timed_speed_v1";
var WPM_TARGET_KEY = "tp_scroll_wpm_target_v1";
var WPM_BASEPX_KEY = "tp_scroll_wpm_basepx_v1";
var WPM_MINPX_KEY = "tp_scroll_wpm_minpx_v1";
var WPM_MAXPX_KEY = "tp_scroll_wpm_maxpx_v1";
var WPM_EWMA_KEY = "tp_scroll_wpm_ewma_v1";
var HYB_ATTACK_KEY = "tp_scroll_hybrid_attack_v1";
var HYB_RELEASE_KEY = "tp_scroll_hybrid_release_v1";
var HYB_IDLE_KEY = "tp_scroll_hybrid_idle_v1";
var STEP_PX_KEY = "tp_scroll_step_px_v1";
var REH_PUNCT_KEY = "tp_scroll_reh_punct_v1";
var REH_RESUME_KEY = "tp_scroll_reh_resume_v1";
var ALLOWED_PAGES = /* @__PURE__ */ new Set(["scripts"]);
var ALLOWED_OVERLAYS = /* @__PURE__ */ new Set(["none", "settings", "help", "shortcuts"]);
var HUD_ENABLED_KEY = "tp_hud_enabled_v1";
var HUD_SPEECH_NOTES_KEY = "tp_hud_speech_notes_v1";
var OVERLAY_KEY = "tp_overlay_v1";
var CAMERA_KEY = "tp_camera_enabled_v1";
var persistMap = {
  settingsTab: SETTINGS_TAB_KEY,
  micDevice: DEVICE_KEY,
  obsEnabled: OBS_ENABLED_KEY,
  obsScene: OBS_SCENE_KEY,
  obsReconnect: OBS_RECONNECT_KEY,
  obsHost: OBS_HOST_KEY,
  obsPassword: OBS_PASSWORD_KEY,
  autoRecord: AUTO_RECORD_KEY,
  prerollSeconds: PREROLL_SEC_KEY,
  devHud: DEV_HUD_KEY,
  hudEnabledByUser: HUD_ENABLED_KEY,
  hudSpeechNotesEnabledByUser: HUD_SPEECH_NOTES_KEY,
  overlay: OVERLAY_KEY,
  cameraEnabled: CAMERA_KEY,
  singleMonitorReadEnabled: SINGLE_MONITOR_READ_KEY,
  // Scroll router persistence
  scrollMode: SCROLL_MODE_KEY,
  timedSpeed: TIMED_SPEED_KEY,
  wpmTarget: WPM_TARGET_KEY,
  wpmBasePx: WPM_BASEPX_KEY,
  wpmMinPx: WPM_MINPX_KEY,
  wpmMaxPx: WPM_MAXPX_KEY,
  wpmEwmaSec: WPM_EWMA_KEY,
  hybridAttackMs: HYB_ATTACK_KEY,
  hybridReleaseMs: HYB_RELEASE_KEY,
  hybridIdleMs: HYB_IDLE_KEY,
  stepPx: STEP_PX_KEY,
  rehearsalPunct: REH_PUNCT_KEY,
  rehearsalResumeMs: REH_RESUME_KEY,
  "asr.engine": ASR_ENGINE_KEY,
  "asr.language": ASR_LANG_KEY,
  "asr.useInterimResults": ASR_INTERIM_KEY,
  "asr.threshold": ASR_THRESHOLD_KEY,
  "asr.endpointMs": ASR_ENDPOINT_KEY,
  "asr.filterFillers": ASR_FILTER_KEY,
  asrCalmModeEnabled: ASR_CALM_MODE_KEY,
  asrProfiles: ASR_PROFILES_KEY,
  asrActiveProfileId: ASR_ACTIVE_PROFILE_KEY,
  asrTuningProfiles: ASR_TUNING_PROFILES_KEY,
  asrTuningActiveProfileId: ASR_TUNING_ACTIVE_PROFILE_KEY
};
function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function loadLegacyAsrSettings() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LEGACY_ASR_SETTINGS_KEY);
    return parseJson(raw);
  } catch {
    return null;
  }
}
function migrateAutoRecordFlag() {
  try {
    const current = localStorage.getItem(AUTO_RECORD_KEY);
    if (current !== null && typeof current !== "undefined") {
      if (localStorage.getItem(LEGACY_AUTO_RECORD_KEY) !== null) {
        try {
          localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
        } catch {
        }
      }
      return;
    }
    const legacy = localStorage.getItem(LEGACY_AUTO_RECORD_KEY);
    if (legacy !== null && typeof legacy !== "undefined") {
      localStorage.setItem(AUTO_RECORD_KEY, legacy === "1" ? "1" : "0");
      try {
        localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
      } catch {
      }
    }
  } catch {
  }
}
migrateAutoRecordFlag();
function normalizeScrollMode(mode) {
  const v = String(mode || "").trim().toLowerCase();
  if (!v) return "hybrid";
  if (v === "manual") return "step";
  return v;
}
function readAndMigrateScrollMode() {
  const legacyKeys = ["tp_scroll_mode", "tp_scroll_mode_v1", "tp_scroll_mode_v2", "tp_scroll_mode_backup"];
  try {
    const canonical = localStorage.getItem(SCROLL_MODE_KEY);
    if (canonical) {
      const norm = normalizeScrollMode(canonical);
      if (norm === "asr") {
        localStorage.setItem(SCROLL_MODE_KEY, "hybrid");
        try {
          localStorage.setItem("tp_asr_boot_fallback", "1");
        } catch {
        }
        legacyKeys.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {
          }
        });
        return "hybrid";
      }
      if (norm !== canonical) localStorage.setItem(SCROLL_MODE_KEY, norm);
      legacyKeys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {
        }
      });
      return norm;
    }
    for (const k of legacyKeys) {
      const legacy = localStorage.getItem(k);
      if (legacy) {
        const norm = normalizeScrollMode(legacy);
        if (norm === "asr") {
          localStorage.setItem(SCROLL_MODE_KEY, "hybrid");
          try {
            localStorage.setItem("tp_asr_boot_fallback", "1");
          } catch {
          }
          try {
            localStorage.removeItem(k);
          } catch {
          }
          return "hybrid";
        }
        localStorage.setItem(SCROLL_MODE_KEY, norm);
        try {
          localStorage.removeItem(k);
        } catch {
        }
        return norm;
      }
    }
  } catch {
  }
  return "hybrid";
}
function buildInitialState() {
  const legacyAsrSettings = loadLegacyAsrSettings();
  return {
    // UI / Settings
    settingsTab: (() => {
      try {
        return localStorage.getItem(SETTINGS_TAB_KEY) || "general";
      } catch {
        return "general";
      }
    })(),
    micDevice: (() => {
      try {
        return localStorage.getItem(DEVICE_KEY) || "";
      } catch {
        return "";
      }
    })(),
    cameraEnabled: (() => {
      try {
        const raw = localStorage.getItem(CAMERA_KEY);
        if (raw == null) return false;
        return raw === "1";
      } catch {
        return false;
      }
    })(),
    cameraAvailable: false,
    micGranted: false,
    obsEnabled: (() => {
      try {
        return localStorage.getItem(OBS_ENABLED_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    obsScene: (() => {
      try {
        return localStorage.getItem(OBS_SCENE_KEY) || "";
      } catch {
        return "";
      }
    })(),
    obsReconnect: (() => {
      try {
        return localStorage.getItem(OBS_RECONNECT_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    autoRecord: (() => {
      try {
        return localStorage.getItem(AUTO_RECORD_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    prerollSeconds: (() => {
      try {
        const n = parseInt(localStorage.getItem(PREROLL_SEC_KEY) || "3", 10);
        return isFinite(n) ? Math.max(0, Math.min(10, n)) : 3;
      } catch {
        return 3;
      }
    })(),
    devHud: (() => {
      try {
        return localStorage.getItem(DEV_HUD_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    hudSupported: true,
    hudEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_ENABLED_KEY) !== "0";
      } catch {
        return true;
      }
    })(),
    hudSpeechNotesEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_SPEECH_NOTES_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    singleMonitorReadEnabled: (() => {
      try {
        return localStorage.getItem(SINGLE_MONITOR_READ_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    asrLive: false,
    "asr.engine": (() => {
      try {
        const raw = localStorage.getItem(ASR_ENGINE_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.engine && typeof legacyAsrSettings.engine === "string") {
          return legacyAsrSettings.engine;
        }
      } catch {
      }
      return "webspeech";
    })(),
    "asr.language": (() => {
      try {
        const raw = localStorage.getItem(ASR_LANG_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.lang && typeof legacyAsrSettings.lang === "string") {
          return legacyAsrSettings.lang;
        }
      } catch {
      }
      return "en-US";
    })(),
    "asr.useInterimResults": (() => {
      try {
        const raw = localStorage.getItem(ASR_INTERIM_KEY);
        if (raw !== null) return raw === "1";
        if (legacyAsrSettings?.interim !== void 0) return !!legacyAsrSettings.interim;
      } catch {
      }
      return true;
    })(),
    "asr.filterFillers": (() => {
      try {
        const raw = localStorage.getItem(ASR_FILTER_KEY);
        if (raw !== null) return raw === "1";
        if (legacyAsrSettings?.filterFillers !== void 0) return !!legacyAsrSettings.filterFillers;
      } catch {
      }
      return true;
    })(),
    "asr.threshold": (() => {
      try {
        const raw = localStorage.getItem(ASR_THRESHOLD_KEY);
        const num2 = Number(raw);
        if (raw !== null && !Number.isNaN(num2)) return num2;
        if (legacyAsrSettings?.threshold !== void 0) return Number(legacyAsrSettings.threshold) || 0.6;
      } catch {
      }
      return 0.6;
    })(),
    "asr.endpointMs": (() => {
      try {
        const raw = localStorage.getItem(ASR_ENDPOINT_KEY);
        const num2 = Number(raw);
        if (raw !== null && !Number.isNaN(num2)) return num2;
        if (legacyAsrSettings?.endpointMs !== void 0) return Number(legacyAsrSettings.endpointMs) || 700;
      } catch {
      }
      return 700;
    })(),
    asrCalmModeEnabled: (() => {
      try {
        const raw = localStorage.getItem(ASR_CALM_MODE_KEY);
        if (raw !== null) return raw === "1";
      } catch {
      }
      return false;
    })(),
    asrProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_PROFILES_KEY);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return {};
    })(),
    asrActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {
      }
      return null;
    })(),
    asrTuningProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_PROFILES_KEY);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return {};
    })(),
    asrTuningActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {
      }
      return null;
    })(),
    asrLastAppliedAt: 0,
    asrLastAppliedSummary: {},
    asrLastApplyOk: false,
    settingsSaveStatus: { state: "idle", at: 0 },
    overlay: (() => {
      try {
        const v = localStorage.getItem(OVERLAY_KEY) || "none";
        if (!ALLOWED_OVERLAYS.has(v)) {
          try {
            localStorage.removeItem(OVERLAY_KEY);
          } catch {
          }
          return "none";
        }
        return v;
      } catch {
        return "none";
      }
    })(),
    page: (() => {
      try {
        const v = "scripts";
        if (!ALLOWED_PAGES.has(v)) {
          return "scripts";
        }
        return v;
      } catch {
        return "scripts";
      }
    })(),
    obsHost: (() => {
      try {
        return localStorage.getItem(OBS_HOST_KEY) || "";
      } catch {
        return "";
      }
    })(),
    obsPassword: (() => {
      try {
        return localStorage.getItem(OBS_PASSWORD_KEY) || "";
      } catch {
        return "";
      }
    })(),
    // Scroll router (persisted)
    scrollMode: (() => {
      const fromPrefs = (() => {
        try {
          const prefs = loadScrollPrefs();
          if (prefs?.mode) return normalizeScrollMode(prefs.mode);
        } catch {
        }
        return null;
      })();
      if (fromPrefs === "asr") {
        try {
          localStorage.setItem("tp_asr_boot_fallback", "1");
        } catch {
        }
      }
      const migrated = readAndMigrateScrollMode();
      const chosen = normalizeScrollMode((fromPrefs === "asr" ? null : fromPrefs) || migrated);
      try {
        localStorage.setItem(SCROLL_MODE_KEY, chosen);
      } catch {
      }
      return chosen;
    })(),
    timedSpeed: (() => {
      try {
        const v = parseFloat(localStorage.getItem(TIMED_SPEED_KEY) || "");
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmTarget: (() => {
      try {
        const v = parseInt(localStorage.getItem(WPM_TARGET_KEY) || "");
        return isFinite(v) && v >= 60 ? v : 180;
      } catch {
        return 180;
      }
    })(),
    wpmBasePx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_BASEPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmMinPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MINPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 6;
      } catch {
        return 6;
      }
    })(),
    wpmMaxPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MAXPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 200;
      } catch {
        return 200;
      }
    })(),
    wpmEwmaSec: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_EWMA_KEY) || "");
        return isFinite(v) && v > 0 ? v : 1;
      } catch {
        return 1;
      }
    })(),
    hybridAttackMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_ATTACK_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    hybridReleaseMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_RELEASE_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 250;
      } catch {
        return 250;
      }
    })(),
    hybridIdleMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_IDLE_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 1500;
      } catch {
        return 1500;
      }
    })(),
    stepPx: (() => {
      try {
        const v = parseInt(localStorage.getItem(STEP_PX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    rehearsalPunct: (() => {
      try {
        const v = localStorage.getItem(REH_PUNCT_KEY);
        return v != null && v !== "" ? v : ".,;:?!";
      } catch {
        return ".,;:?!";
      }
    })(),
    rehearsalResumeMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(REH_RESUME_KEY) || "");
        return isFinite(v) && v >= 100 ? v : 1e3;
      } catch {
        return 1e3;
      }
    })(),
    // transient session state (not persisted)
    obsUrl: "",
    obsPort: "",
    obsSecure: false
  };
}
function ensureExistingState() {
  if (IS_TEST) {
    try {
      delete window.__tpStore;
    } catch {
    }
    return {};
  }
  try {
    const existing = window.__tpStore;
    if (!existing || typeof existing !== "object") return {};
    const snapshot = typeof existing.getSnapshot === "function" ? existing.getSnapshot() : existing.state;
    if (snapshot && typeof snapshot === "object") return snapshot;
  } catch {
  }
  return {};
}
function sanitizeState(state3) {
  if (!ALLOWED_PAGES.has(state3.page)) {
    state3.page = "scripts";
  }
  if (!ALLOWED_OVERLAYS.has(state3.overlay)) {
    state3.overlay = "none";
    try {
      localStorage.removeItem(OVERLAY_KEY);
    } catch {
    }
  }
  if (state3.scrollMode === "manual") {
    state3.scrollMode = "step";
  }
  if (!state3.asrProfiles || typeof state3.asrProfiles !== "object") {
    state3.asrProfiles = {};
  }
  if (state3.asrActiveProfileId && typeof state3.asrActiveProfileId !== "string") {
    state3.asrActiveProfileId = null;
  }
  if (!state3.asrTuningProfiles || typeof state3.asrTuningProfiles !== "object") {
    state3.asrTuningProfiles = {};
  }
  if (state3.asrTuningActiveProfileId && typeof state3.asrTuningActiveProfileId !== "string") {
    state3.asrTuningActiveProfileId = null;
  }
  if (typeof state3.asrLastAppliedAt !== "number") {
    state3.asrLastAppliedAt = 0;
  }
  if (!state3.asrLastAppliedSummary || typeof state3.asrLastAppliedSummary !== "object") {
    state3.asrLastAppliedSummary = {};
  }
  if (typeof state3.asrLastApplyOk !== "boolean") {
    state3.asrLastApplyOk = false;
  }
  if (!state3.settingsSaveStatus || typeof state3.settingsSaveStatus !== "object") {
    state3.settingsSaveStatus = { state: "idle", at: 0 };
  }
  return state3;
}
function createAppStore(initial) {
  const subs3 = /* @__PURE__ */ Object.create(null);
  const baseState = buildInitialState();
  const state3 = sanitizeState(
    Object.assign(
      {},
      baseState,
      ensureExistingState(),
      initial || {}
    )
  );
  function notify(key, value) {
    try {
      const k = String(key);
      const fns = subs3[k] || [];
      for (let i = 0; i < fns.length; i++) {
        try {
          fns[i](value);
        } catch {
        }
      }
    } catch {
    }
  }
  function get(key) {
    try {
      return state3[key];
    } catch {
      return void 0;
    }
  }
  function set(key, value) {
    try {
      if (key === "page") {
        value = ALLOWED_PAGES.has(value) ? value : "scripts";
      }
      if (key === "overlay") {
        value = ALLOWED_OVERLAYS.has(value) ? value : "none";
      }
      const prev = state3[key];
      if (prev === value) return value;
      state3[key] = value;
      if (key === "scrollMode") {
        try {
          const ctx = getScrollModeAuditContext();
          recordScrollModeWrite({
            writer: ctx?.writer || "unknown",
            from: prev,
            to: value,
            phase: state3["session.phase"],
            source: ctx?.meta?.source,
            via: ctx?.meta?.via,
            stack: !!ctx?.meta?.stack
          });
        } catch {
        }
      }
      try {
        const storageKey = persistMap[key];
        if (storageKey) {
          if (value === null || typeof value === "undefined") {
            localStorage.removeItem(storageKey);
          } else if (typeof value === "boolean") {
            localStorage.setItem(storageKey, value ? "1" : "0");
          } else if (typeof value === "object") {
            try {
              localStorage.setItem(storageKey, JSON.stringify(value));
            } catch {
            }
          } else {
            localStorage.setItem(storageKey, String(value));
          }
          if (key === "autoRecord") {
            try {
              localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
            } catch {
            }
          }
          if (key === "scrollMode") {
            saveScrollPrefs({ mode: String(value) });
          }
        }
      } catch {
      }
      notify(key, value);
      return value;
    } catch {
      return value;
    }
  }
  function subscribe(key, fn) {
    if (typeof fn !== "function") return () => {
    };
    const k = String(key);
    subs3[k] = subs3[k] || [];
    subs3[k].push(fn);
    try {
      fn(state3[key]);
    } catch {
    }
    return function unsubscribe() {
      try {
        subs3[k] = (subs3[k] || []).filter((x) => x !== fn);
      } catch {
      }
    };
  }
  function subscribeAll(map) {
    const unsubs = [];
    try {
      for (const k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          const key = k;
          const fn = map[key];
          if (fn) unsubs.push(subscribe(key, fn));
        }
      }
    } catch {
    }
    return function unsubscribeAll() {
      unsubs.forEach((u) => u && u());
    };
  }
  const appStore = {
    __tsOwned: true,
    get,
    set,
    subscribe,
    subscribeAll,
    state: state3,
    getSnapshot: () => ({ ...state3 })
  };
  try {
    if (!IS_TEST) {
      const w2 = window;
      const existing = w2.__tpStore;
      if (!existing || !existing.__tsOwned) {
        try {
          Object.defineProperty(w2, "__tpStore", {
            value: appStore,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch {
          w2.__tpStore = appStore;
        }
      }
    }
  } catch {
  }
  return appStore;
}
var appStoreSingleton = createAppStore();

// src/profile/profile-schema.ts
function profilePatch(p) {
  return p;
}
function defaultProfileV1() {
  return {
    version: 1,
    identity: {},
    ui: {
      theme: "dark",
      panels: {
        settingsOpen: false,
        speakersOpen: false,
        helpOpen: false,
        hudOpen: false
      },
      windows: {
        main: {
          typography: {
            fontSizePx: 56,
            lineHeight: 1.4,
            letterSpacingEm: 0,
            maxLineWidthPx: null
          },
          layout: { markerY: 0.33, paddingTopPx: 16, paddingBottomPx: 16 },
          highlight: { mode: "line", color: "#ffd400", intensity: 0.35 }
        },
        display: {
          typography: {
            fontSizePx: 56,
            lineHeight: 1.4,
            letterSpacingEm: 0,
            maxLineWidthPx: null
          },
          layout: { markerY: 0.33, paddingTopPx: 16, paddingBottomPx: 16 },
          highlight: { mode: "line", color: "#ffd400", intensity: 0.35 }
        }
      },
      scriptView: {
        showPacingCues: true,
        hideNotes: true,
        showSpeakerTags: true
      }
    },
    scroll: {
      mode: "wpm",
      wpm: { value: 140, min: 60, max: 260, wplHint: 8 },
      timed: { pxPerSec: 40, minPxPerSec: 5, maxPxPerSec: 220 },
      hybrid: {
        ctrlEnabled: true,
        sensitivity: 1,
        assistMax: 1.25,
        brakeMin: 0.65,
        confMin: 0.25
      },
      behavior: { autoStartOnLive: false, autoStopOnEnd: false }
    },
    asr: {
      language: "en-US",
      preferredMicDeviceId: null,
      tuning: {
        confidenceFloor: 0.25,
        lagCompMs: 150,
        winBackLines: 3,
        winAheadLines: 6
      }
    },
    workflow: {
      lastSpeakerProfileId: null,
      lastScript: { folderKey: null, fileKey: null, reopenOnBoot: true },
      hasSeenWelcome: false
    },
    integrations: {
      obs: {
        enabled: false,
        websocketUrl: "ws://127.0.0.1:4455",
        password: null,
        sceneName: null,
        sourceName: null,
        autoRecord: false
      }
    },
    dev: { logVerbosity: "normal", hybridLogThrottleMs: 500 }
  };
}
function applyProfilePatch(base, patch) {
  const merged = deepMerge(
    base,
    patch
  );
  return coerceProfile(merged);
}
function coerceProfile(input) {
  if (!input || typeof input !== "object") return defaultProfileV1();
  const migrated = migrateProfile(input);
  const p = deepMerge(
    defaultProfileV1(),
    migrated
  );
  const clamp3 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clamp012 = (v) => clamp3(v, 0, 1);
  for (const role of ["main", "display"]) {
    const t = p.ui.windows[role].typography;
    t.fontSizePx = clamp3(num(t.fontSizePx, 56), 18, 140);
    t.lineHeight = clamp3(num(t.lineHeight, 1.4), 1, 2.4);
    t.letterSpacingEm = clamp3(num(t.letterSpacingEm, 0), -0.1, 0.2);
    t.maxLineWidthPx = t.maxLineWidthPx == null ? null : clamp3(num(t.maxLineWidthPx, 600), 240, 2e3);
    const l = p.ui.windows[role].layout;
    l.markerY = clamp012(num(l.markerY, 0.33));
    l.paddingTopPx = clamp3(num(l.paddingTopPx, 16), 0, 200);
    l.paddingBottomPx = clamp3(num(l.paddingBottomPx, 16), 0, 200);
    const h = p.ui.windows[role].highlight;
    h.intensity = clamp012(num(h.intensity, 0.35));
  }
  p.scroll.wpm.min = clamp3(num(p.scroll.wpm.min, 60), 10, 600);
  p.scroll.wpm.max = clamp3(num(p.scroll.wpm.max, 260), 10, 600);
  if (p.scroll.wpm.min > p.scroll.wpm.max) {
    const tmp = p.scroll.wpm.min;
    p.scroll.wpm.min = p.scroll.wpm.max;
    p.scroll.wpm.max = tmp;
  }
  p.scroll.wpm.value = clamp3(num(p.scroll.wpm.value, 140), p.scroll.wpm.min, p.scroll.wpm.max);
  p.scroll.wpm.wplHint = clamp3(num(p.scroll.wpm.wplHint, 8), 3, 30);
  p.scroll.timed.minPxPerSec = clamp3(num(p.scroll.timed.minPxPerSec, 5), 0.1, 2e3);
  p.scroll.timed.maxPxPerSec = clamp3(num(p.scroll.timed.maxPxPerSec, 220), 0.1, 2e3);
  if (p.scroll.timed.minPxPerSec > p.scroll.timed.maxPxPerSec) {
    const tmp = p.scroll.timed.minPxPerSec;
    p.scroll.timed.minPxPerSec = p.scroll.timed.maxPxPerSec;
    p.scroll.timed.maxPxPerSec = tmp;
  }
  p.scroll.timed.pxPerSec = clamp3(num(p.scroll.timed.pxPerSec, 40), p.scroll.timed.minPxPerSec, p.scroll.timed.maxPxPerSec);
  p.scroll.hybrid.sensitivity = clamp3(num(p.scroll.hybrid.sensitivity, 1), 0.25, 3);
  p.scroll.hybrid.assistMax = clamp3(num(p.scroll.hybrid.assistMax, 1.25), 1, 3);
  p.scroll.hybrid.brakeMin = clamp3(num(p.scroll.hybrid.brakeMin, 0.65), 0.1, 1);
  p.scroll.hybrid.confMin = clamp012(num(p.scroll.hybrid.confMin, 0.25));
  p.asr.tuning.confidenceFloor = clamp012(num(p.asr.tuning.confidenceFloor, 0.25));
  p.asr.tuning.lagCompMs = clamp3(num(p.asr.tuning.lagCompMs, 150), 0, 2e3);
  p.asr.tuning.winBackLines = clamp3(num(p.asr.tuning.winBackLines, 3), 0, 80);
  p.asr.tuning.winAheadLines = clamp3(num(p.asr.tuning.winAheadLines, 6), 0, 120);
  p.dev.hybridLogThrottleMs = clamp3(num(p.dev.hybridLogThrottleMs, 500), 0, 5e3);
  p.workflow.hasSeenWelcome = Boolean(p.workflow.hasSeenWelcome);
  return p;
}
function migrateProfile(input) {
  const v = typeof input.version === "number" ? input.version : 0;
  if (v <= 0) {
    const out = { ...input, version: 1 };
    const legacyWpl = safeNum(input.tp_wpl_hint ?? input.wplHint ?? null);
    if (legacyWpl != null) {
      out.scroll = out.scroll ?? {};
      out.scroll.wpm = out.scroll.wpm ?? {};
      out.scroll.wpm.wplHint = legacyWpl;
    }
    return out;
  }
  return input;
}
function num(v, fallback) {
  const n = safeNum(v);
  return n == null ? fallback : n;
}
function safeNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === void 0) continue;
    const bv = out[k];
    if (isPlainObject(bv) && isPlainObject(v)) out[k] = deepMerge(bv, v);
    else out[k] = v;
  }
  return out;
}

// src/profile/profile-store.ts
var ProfileStore = class {
  constructor(supabase2) {
    this.supabase = supabase2;
  }
  cache = null;
  async loadProfile() {
    const user = await this.getUser();
    const userId = user.id;
    const { data, error } = await this.supabase.from("tp_profiles").select("user_id, version, profile, created_at, updated_at").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) {
      const def = defaultProfileV1();
      const { error: insErr } = await this.supabase.from("tp_profiles").insert({
        user_id: userId,
        version: def.version,
        profile: def
      });
      if (insErr) throw insErr;
      this.cache = def;
      return def;
    }
    const coerced = coerceProfile(data.profile ?? {});
    this.cache = coerced;
    return coerced;
  }
  async getProfile() {
    return this.cache ?? this.loadProfile();
  }
  async saveProfilePatch(patch) {
    const user = await this.getUser();
    const userId = user.id;
    const current = await this.getProfile();
    const next = applyProfilePatch(current, patch);
    this.cache = next;
    const { error } = await this.supabase.from("tp_profiles").upsert(
      {
        user_id: userId,
        version: next.version,
        profile: next
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
    return next;
  }
  patch(p) {
    return profilePatch(p);
  }
  async getUser() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Not authenticated: no user.");
    return data.user;
  }
};

// src/profile/profile-persist.ts
function createProfilePersister(store2, options) {
  const delayMs = Number.isFinite(options?.delayMs ?? NaN) ? options.delayMs : 450;
  let pending = null;
  let timer = null;
  let saving = null;
  const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  const merge = (base, patch) => {
    if (!base) return patch;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value === void 0) continue;
      const existing = out[key];
      if (isObject(existing) && isObject(value)) {
        out[key] = merge(existing, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  };
  const scheduleFlush = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush2(), delayMs);
  };
  const flush2 = async () => {
    if (!pending) return;
    if (saving) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return;
    }
    const patch = pending;
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      saving = store2.saveProfilePatch(patch);
      await saving;
    } finally {
      saving = null;
      if (pending) {
        await flush2();
      }
    }
  };
  const persist = (patch) => {
    pending = merge(pending ?? {}, patch);
    scheduleFlush();
  };
  return {
    persist,
    flush: flush2
  };
}

// ../../node_modules/.pnpm/@supabase+supabase-js@2.91.1/node_modules/@supabase/supabase-js/dist/esm/wrapper.mjs
var index = __toESM(require_main4(), 1);
var {
  PostgrestError,
  FunctionsHttpError,
  FunctionsFetchError,
  FunctionsRelayError,
  FunctionsError,
  FunctionRegion,
  SupabaseClient,
  createClient,
  GoTrueAdminApi,
  GoTrueClient,
  AuthAdminApi,
  AuthClient,
  navigatorLock,
  NavigatorLockAcquireTimeoutError,
  lockInternals,
  processLock,
  SIGN_OUT_SCOPES,
  AuthError,
  AuthApiError,
  AuthUnknownError,
  CustomAuthError,
  AuthSessionMissingError,
  AuthInvalidTokenResponseError,
  AuthInvalidCredentialsError,
  AuthImplicitGrantRedirectError,
  AuthPKCEGrantCodeExchangeError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
  AuthInvalidJwtError,
  isAuthError,
  isAuthApiError,
  isAuthSessionMissingError,
  isAuthImplicitGrantRedirectError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  RealtimePresence,
  RealtimeChannel,
  RealtimeClient,
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  REALTIME_PRESENCE_LISTEN_EVENTS,
  REALTIME_SUBSCRIBE_STATES,
  REALTIME_CHANNEL_STATES
} = index.default || index;

// src/forge/supabaseClient.ts
var w = typeof window !== "undefined" ? window : {};
var meta = typeof import.meta !== "undefined" ? import.meta : {};
var metaEnv = meta.env || {};
var SUPABASE_URL = w.__forgeSupabaseUrl || metaEnv.VITE_SUPABASE_URL || "";
var SUPABASE_ANON_KEY = w.__forgeSupabaseAnonKey || metaEnv.VITE_SUPABASE_ANON_KEY || "";
var AUTH_STORAGE_KEY = "forge-auth";
var hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
function createSupabaseStub(reason) {
  const handler = {
    get() {
      return new Proxy(() => {
        throw new Error(reason);
      }, handler);
    },
    apply() {
      throw new Error(reason);
    }
  };
  return new Proxy(() => {
    throw new Error(reason);
  }, handler);
}
if (!hasSupabaseConfig) {
  try {
    console.error("[supabaseClient] Missing Supabase URL or anon key.");
  } catch {
  }
}
var supabaseClient = null;
if (hasSupabaseConfig) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
        ...typeof window !== "undefined" ? { storage: window.localStorage } : {}
      }
    });
  } catch (err) {
    hasSupabaseConfig = false;
    try {
      console.error("[supabaseClient] Failed to init Supabase client.", err);
    } catch {
    }
  }
}
var supabase = supabaseClient || createSupabaseStub("[supabaseClient] Supabase not configured.");

// src/state/appStore.ts
function getAppStore() {
  if (typeof window === "undefined") return null;
  try {
    const store2 = window.__tpStore;
    return store2 || null;
  } catch {
    return null;
  }
}

// src/asr/store.ts
var KEY = "tp_asr_profiles_v1";
var ACTIVE_KEY = "tp_asr_active_profile_v1";
var store = getAppStore();
var stateFromStore = (() => {
  if (!store) return null;
  try {
    const profiles = store.get("asrProfiles") || {};
    const activeProfileId = store.get("asrActiveProfileId") || void 0;
    return { profiles, activeProfileId };
  } catch {
    return null;
  }
})();
var state = (() => {
  try {
    if (stateFromStore) {
      return {
        profiles: stateFromStore.profiles || {},
        activeProfileId: stateFromStore.activeProfileId
      };
    }
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const legacyProfiles = parsed && typeof parsed === "object" && "profiles" in parsed ? parsed.profiles : null;
    const profiles = legacyProfiles && typeof legacyProfiles === "object" ? legacyProfiles : parsed && typeof parsed === "object" ? parsed : {};
    const activeProfileId = typeof parsed?.activeProfileId === "string" && parsed.activeProfileId || (localStorage.getItem(ACTIVE_KEY) || void 0);
    return { profiles: profiles || {}, activeProfileId };
  } catch {
    return { profiles: {} };
  }
})();
var subs = /* @__PURE__ */ new Set();
var storeSyncSuppressed = false;
function syncAppStore() {
  if (!store) return;
  storeSyncSuppressed = true;
  try {
    store.set("asrProfiles", state.profiles);
  } catch {
  }
  try {
    store.set("asrActiveProfileId", state.activeProfileId ?? null);
  } catch {
  }
  storeSyncSuppressed = false;
}
function save(opts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.profiles || {}));
  } catch {
  }
  try {
    if (state.activeProfileId) localStorage.setItem(ACTIVE_KEY, state.activeProfileId);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
  }
  subs.forEach((fn) => {
    try {
      fn(state);
    } catch {
    }
  });
  if (!opts?.fromStore) {
    syncAppStore();
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:asrChanged", { detail: state }));
  } catch {
  }
}
var getAsrState = () => state;
function hasActiveAsrProfile() {
  const state3 = getAsrState();
  return !!(state3?.activeProfileId && state3.profiles?.[state3.activeProfileId]);
}
if (store) {
  try {
    store.subscribe("asrProfiles", (next) => {
      if (storeSyncSuppressed) return;
      const profilesObj = next && typeof next === "object" ? next : {};
      state.profiles = { ...profilesObj };
      save({ fromStore: true });
    });
    store.subscribe("asrActiveProfileId", (next) => {
      if (storeSyncSuppressed) return;
      state.activeProfileId = typeof next === "string" && next ? next : void 0;
      save({ fromStore: true });
    });
  } catch {
  }
  syncAppStore();
}
try {
  window.addEventListener("storage", (e) => {
    try {
      if (e.key === KEY && e.newValue) {
        const parsed = JSON.parse(e.newValue);
        const legacyProfiles = parsed && typeof parsed === "object" && "profiles" in parsed ? parsed.profiles : null;
        const profiles = legacyProfiles && typeof legacyProfiles === "object" ? legacyProfiles : parsed && typeof parsed === "object" ? parsed : {};
        state = {
          ...state,
          profiles: profiles || {}
        };
        save({ fromStore: true });
      }
      if (e.key === ACTIVE_KEY) {
        state.activeProfileId = e.newValue || void 0;
        save({ fromStore: true });
      }
    } catch {
    }
  });
} catch {
}

// src/media/calibration-sidebar.ts
var SELECT_ID = "sidebarCalSelect";
function getSelect() {
  if (typeof document === "undefined") return null;
  return document.getElementById(SELECT_ID);
}
function focusSidebarCalibrationSelect() {
  const select = getSelect();
  if (!select) return false;
  try {
    select.focus({ preventScroll: true });
  } catch {
  }
  try {
    select.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch {
  }
  try {
    select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  } catch {
  }
  try {
    select.click();
  } catch {
  }
  return true;
}

// src/ui/toasts.ts
var CONTAINER_ID = "tp_toast_container";
var MAX_VISIBLE = 3;
var DEFAULT_FADE_MS = 4e3;
function ensureContainer() {
  let c = document.getElementById(CONTAINER_ID);
  if (c) return c;
  c = document.createElement("div");
  c.id = CONTAINER_ID;
  c.className = "tp-toast-container";
  (document.body || document.documentElement).appendChild(c);
  return c;
}
function prune(container) {
  const children = Array.from(container.children);
  while (children.length > MAX_VISIBLE) {
    const first = children.shift();
    if (first && typeof first.remove === "function") {
      first.remove();
    }
  }
}
function showToast(message, opts = {}) {
  try {
    const container = ensureContainer();
    prune(container);
    const t = document.createElement("div");
    const typeClass = opts.type ? String(opts.type) : "";
    t.className = `tp-toast show ${typeClass}`;
    const txt = document.createElement("span");
    txt.textContent = String(message ?? "");
    t.appendChild(txt);
    if (typeof opts.action === "function") {
      const btn = document.createElement("button");
      btn.textContent = String(opts.actionLabel || "Open");
      btn.className = "tp-toast-action";
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        try {
          opts.action && opts.action();
        } catch {
        }
        t.classList.remove("show");
        window.setTimeout(() => t.remove(), 120);
      });
      t.appendChild(btn);
    }
    t.addEventListener("click", () => {
      t.classList.remove("show");
      window.setTimeout(() => t.remove(), 120);
    });
    container.appendChild(t);
    prune(container);
    const timeout = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_FADE_MS;
    window.setTimeout(() => {
      t.classList.remove("show");
      window.setTimeout(() => t.remove(), 120);
    }, timeout);
  } catch (err) {
    try {
      console.debug("[toast] failed to render", message, opts, err);
    } catch {
    }
  }
}
if (typeof window !== "undefined") {
  if (!window.toast) {
    window.toast = showToast;
  }
}

// src/features/scroll/scroll-router/router-impl.ts
var isDevMode2 = /* @__PURE__ */ (() => {
  let cache = null;
  return () => {
    if (cache !== null) return cache;
    try {
      if (typeof window === "undefined") {
        cache = false;
        return cache;
      }
      const params = new URLSearchParams(window.location.search || "");
      if (params.has("dev")) {
        cache = true;
        return cache;
      }
      if (params.has("ci") || params.has("mockFolder") || params.has("uiMock")) {
        cache = true;
        return cache;
      }
      const storage = window.localStorage;
      if (storage?.getItem("tp_dev_mode") === "1") {
        cache = true;
        return cache;
      }
      const w2 = window;
      if (w2.__TP_DEV || w2.__TP_DEV1) {
        cache = true;
        return cache;
      }
    } catch {
    }
    cache = false;
    return cache;
  };
})();
var ASR_COMPLETION_GATE_KEY = "tp_asr_completion_gate";
var asrCompletionGateBypassLogged = false;
function isAsrCompletionGateEnabled() {
  if (!isDevMode2()) return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const devParam = params.has("dev") || params.get("dev") === "1";
    if (!devParam) return false;
    return localStorage.getItem(ASR_COMPLETION_GATE_KEY) === "1";
  } catch {
    return false;
  }
}
function isHybridAggroEnabled() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("hybridAggro") === "1") return true;
    if (window.location.hash && window.location.hash.includes("hybridAggro")) return true;
    if (localStorage.getItem("tp_hybrid_aggro") === "1") return true;
  } catch {
  }
  return false;
}
var viewerRole = (() => {
  if (typeof window === "undefined") return "main";
  const path = String(window.location?.pathname || "").toLowerCase();
  const bodyRole = String(window.document?.body?.dataset?.viewerRole || "").toLowerCase();
  if (path.includes("display") || bodyRole === "display") return "display";
  return "main";
})();
function isMainViewer() {
  return viewerRole === "main";
}
function ensureMainViewer(action) {
  if (isMainViewer()) return true;
  try {
    console.warn("[ROLE_GUARD] blocked", { action, viewerRole });
  } catch {
  }
  return false;
}
try {
  console.info("[VIEWER_ROLE]", {
    viewerRole,
    path: typeof window !== "undefined" ? window.location?.pathname : "<unknown>"
  });
} catch {
}
globalThis.__tp_router_stamp = (globalThis.__tp_router_stamp ?? 0) + 1;
try {
  console.warn("[ROUTER_STAMP]", globalThis.__tp_router_stamp);
} catch {
}
var ROUTER_STAMP = globalThis.__tp_router_stamp;
if (typeof window !== "undefined") {
  try {
    window.__tp_router_probe = "scroll-router loaded";
    console.info("[router-probe] scroll-router loaded");
  } catch {
  }
}
var autoIntentProcessor = null;
var pendingAutoIntentDetail = null;
var scrollerEl = null;
var auto = null;
var scrollIntentListenerWired = false;
var legacyAsrIntentLaneBlockedLogged = false;
var ASR_INTENT_DEBOUNCE_MS = 450;
var ASR_INTENT_STABLE_MS = 250;
var ASR_INTENT_FIRST_STABLE_MS = 600;
var ASR_INTENT_WARMUP_MS = 1400;
var ASR_INTENT_MIN_CONF = 0.5;
var ASR_TELEMETRY_MAX_REJECTS = 200;
var ASR_TELEMETRY_WINDOW_MS = 15e3;
var ASR_MATCH_WINDOW_MS = 3e3;
var ASR_MATCH_MAX = 120;
var asrIntentLiveSince = 0;
var committedBlockIdx = -1;
var lastCommitAt = 0;
var lastCandidate = -1;
var stableSince = 0;
var asrMotorConflictLogged = false;
var scrollWriteWarned = false;
var guardHandlerErrorLogged = false;
var hybridScrollGraceListenerInstalled = false;
var hybridModeMismatchLogged = false;
function shouldBlockLegacyAsrIntentLane() {
  try {
    return window.__tpAllowLegacyAsrIntent !== true;
  } catch {
    return true;
  }
}
var recentAsrMatches = [];
var asrBlockLineCacheRef = null;
var asrBlockLineCache = /* @__PURE__ */ new Map();
function logHybridModeMismatch(source) {
  if (!isDevMode2()) return;
  if (hybridModeMismatchLogged) return;
  hybridModeMismatchLogged = true;
  try {
    console.warn("[HYBRID] activity blocked (mode mismatch)", {
      source,
      mode: getScrollMode2()
    });
  } catch {
  }
}
function getAsrTelemetry() {
  if (!isDevMode2()) return null;
  if (typeof window === "undefined") return null;
  const w2 = window;
  if (!w2.__tpAsrTelemetry) {
    w2.__tpAsrTelemetry = {
      intentsSeen: 0,
      finalSeen: 0,
      interimSeen: 0,
      commitAccepted: 0,
      commitRejected: 0,
      rejectReasons: {},
      last: {
        ts: 0,
        mode: "unknown",
        phase: "unknown",
        currentBlockIdx: -1,
        candidateBlockIdx: -1,
        decision: "reject",
        rejectReason: "init",
        completionEvidenceSummary: ""
      },
      last15sRejectTop3: [],
      completionEvidence: null,
      completionEvidenceSummary: "",
      _rejectEvents: []
    };
  }
  return w2.__tpAsrTelemetry;
}
function resolveAsrIntentCandidateBlockIdx(intent) {
  const raw = Number(intent?.target?.blockIdx);
  if (!Number.isFinite(raw)) return -1;
  return Math.max(0, Math.floor(raw));
}
function updateAsrTelemetryTopRejects(telemetry, now2) {
  const cutoff = now2 - ASR_TELEMETRY_WINDOW_MS;
  const events = telemetry._rejectEvents;
  let pruneCount = 0;
  while (pruneCount < events.length && events[pruneCount].ts < cutoff) {
    pruneCount += 1;
  }
  if (pruneCount) {
    events.splice(0, pruneCount);
  }
  const counts = /* @__PURE__ */ new Map();
  for (const entry of events) {
    counts.set(entry.reason, (counts.get(entry.reason) || 0) + 1);
  }
  telemetry.last15sRejectTop3 = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, count]) => ({ reason, count }));
}
function recordAsrIntentTelemetry(telemetry, intentReason) {
  if (!telemetry) return;
  telemetry.intentsSeen += 1;
  if (intentReason.includes("final")) telemetry.finalSeen += 1;
  else if (intentReason.includes("interim")) telemetry.interimSeen += 1;
}
function recordAsrMatchEvent(now2, intent, intentReason) {
  const rawBlockIdx = Number(intent?.target?.blockIdx);
  if (!Number.isFinite(rawBlockIdx) || rawBlockIdx < 0) return;
  const rawLineIdx = Number(intent?.target?.lineIdx);
  const lineIdx = Number.isFinite(rawLineIdx) ? Math.max(0, Math.floor(rawLineIdx)) : null;
  const confidence = Number.isFinite(intent?.confidence) ? Number(intent.confidence) : null;
  const isFinal = intentReason.includes("final");
  recentAsrMatches.push({
    ts: now2,
    blockIdx: Math.max(0, Math.floor(rawBlockIdx)),
    lineIdx,
    isFinal,
    confidence
  });
  const cutoff = now2 - ASR_MATCH_WINDOW_MS;
  let pruneCount = 0;
  while (pruneCount < recentAsrMatches.length && recentAsrMatches[pruneCount].ts < cutoff) {
    pruneCount += 1;
  }
  if (pruneCount) {
    recentAsrMatches.splice(0, pruneCount);
  }
  if (recentAsrMatches.length > ASR_MATCH_MAX) {
    recentAsrMatches.splice(0, recentAsrMatches.length - ASR_MATCH_MAX);
  }
}
function parseLineIndexFromEl(el) {
  if (!el) return null;
  const raw = el.dataset.i || el.dataset.index || el.dataset.line || el.dataset.lineIdx || el.getAttribute("data-line") || el.getAttribute("data-line-idx");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}
function getBlockLineIndices(blockIdx) {
  const blockEls2 = getAsrBlockElements();
  if (!blockEls2 || !blockEls2.length) return null;
  if (asrBlockLineCacheRef !== blockEls2) {
    asrBlockLineCacheRef = blockEls2;
    asrBlockLineCache.clear();
  }
  const cached2 = asrBlockLineCache.get(blockIdx);
  if (cached2) return cached2;
  const blockEl = blockEls2[blockIdx];
  if (!blockEl) return null;
  const lineEls = Array.from(blockEl.querySelectorAll(".line, .tp-line"));
  if (!lineEls.length) return null;
  const indices = [];
  for (const lineEl of lineEls) {
    const idx = parseLineIndexFromEl(lineEl);
    if (idx == null) continue;
    indices.push(idx);
  }
  if (!indices.length) return null;
  indices.sort((a, b) => a - b);
  asrBlockLineCache.set(blockIdx, indices);
  return indices;
}
function buildCompletionEvidence(currentBlockIdx, candidateBlockIdx, now2 = Date.now()) {
  if (!Number.isFinite(candidateBlockIdx) || candidateBlockIdx < 0) return null;
  const blockLineIndices = getBlockLineIndices(currentBlockIdx);
  if (!blockLineIndices || !blockLineIndices.length) return null;
  const totalLinesInBlock = blockLineIndices.length;
  if (totalLinesInBlock <= 0) return null;
  const lastLineIdx = blockLineIndices[blockLineIndices.length - 1];
  if (!Number.isFinite(lastLineIdx)) return null;
  const cutoff = now2 - ASR_MATCH_WINDOW_MS;
  const windowMatches = recentAsrMatches.filter((entry) => entry.ts >= cutoff);
  const hasFinal = windowMatches.some((entry) => entry.isFinal);
  const blockLineSet = new Set(blockLineIndices);
  const matchedLineSet = /* @__PURE__ */ new Set();
  for (const entry of windowMatches) {
    if (entry.lineIdx == null) continue;
    if (blockLineSet.has(entry.lineIdx)) {
      matchedLineSet.add(entry.lineIdx);
    }
  }
  const matchedLineIds = Array.from(matchedLineSet).sort((a, b) => a - b);
  const coverageRatio = totalLinesInBlock > 0 ? Math.min(1, matchedLineIds.length / totalLinesInBlock) : 0;
  const matchedLastLine = matchedLineSet.has(lastLineIdx);
  const trailingWindow = Math.max(1, DEFAULT_COMPLETION_POLICY.trailingLinesWindow);
  const trailingStart = Math.max(0, blockLineIndices.length - trailingWindow);
  const trailingLineSet = new Set(blockLineIndices.slice(trailingStart));
  let matchedTrailingLines = 0;
  for (const idx of matchedLineSet) {
    if (trailingLineSet.has(idx)) matchedTrailingLines += 1;
  }
  const boundaryCrossed = windowMatches.some((entry) => {
    if (entry.blockIdx < candidateBlockIdx) return false;
    if (entry.isFinal) return true;
    if (Number.isFinite(entry.confidence) && entry.confidence >= 0.6) return true;
    return false;
  });
  return {
    currentBlockIdx,
    candidateBlockIdx,
    matchedLineIds,
    totalLinesInBlock,
    matchedLastLine,
    matchedTrailingLines,
    coverageRatio: Math.min(1, Math.max(0, coverageRatio)),
    boundaryCrossed,
    hasFinal
  };
}
function formatCompletionEvidenceSummary(evidence) {
  if (!evidence) return "evidence_missing_block_index";
  const cov = Number.isFinite(evidence.coverageRatio) ? evidence.coverageRatio : 0;
  const covText = cov.toFixed(2);
  const last = evidence.matchedLastLine ? 1 : 0;
  const trail = Number.isFinite(evidence.matchedTrailingLines) ? evidence.matchedTrailingLines : 0;
  const finalFlag = evidence.hasFinal ? 1 : 0;
  const boundary = evidence.boundaryCrossed ? 1 : 0;
  return `cov=${covText} last=${last} trail=${trail} final=${finalFlag} bndry=${boundary}`;
}
function recordAsrReject(telemetry, now2, reasonKey, mode, phase, currentBlockIdx, candidateBlockIdx, completionEvidenceSummary) {
  if (!telemetry) return;
  telemetry.commitRejected += 1;
  telemetry.rejectReasons[reasonKey] = (telemetry.rejectReasons[reasonKey] || 0) + 1;
  telemetry._rejectEvents.push({ ts: now2, reason: reasonKey });
  if (telemetry._rejectEvents.length > ASR_TELEMETRY_MAX_REJECTS) {
    telemetry._rejectEvents.splice(0, telemetry._rejectEvents.length - ASR_TELEMETRY_MAX_REJECTS);
  }
  updateAsrTelemetryTopRejects(telemetry, now2);
  telemetry.last = {
    ts: now2,
    mode,
    phase,
    currentBlockIdx,
    candidateBlockIdx,
    decision: "reject",
    rejectReason: reasonKey,
    completionEvidenceSummary: completionEvidenceSummary || telemetry.completionEvidenceSummary || "",
    completionOk: reasonKey.startsWith("reject_completion_") ? false : telemetry.last?.completionOk,
    completionReason: reasonKey.startsWith("reject_completion_") ? reasonKey.replace("reject_completion_", "") : telemetry.last?.completionReason
  };
}
function recordAsrAccept(telemetry, now2, mode, phase, currentBlockIdx, candidateBlockIdx, completionEvidenceSummary, completionConfidence, completionStatus, completionReason) {
  if (!telemetry) return;
  telemetry.commitAccepted += 1;
  const resolvedStatus = completionStatus || "complete";
  telemetry.last = {
    ts: now2,
    mode,
    phase,
    currentBlockIdx,
    candidateBlockIdx,
    decision: "accept",
    completionEvidenceSummary: completionEvidenceSummary || telemetry.completionEvidenceSummary || "",
    completionOk: resolvedStatus === "complete",
    completionReason: completionReason || (resolvedStatus === "complete" ? "complete" : "unknown"),
    completionConfidence: Number.isFinite(completionConfidence) ? completionConfidence : telemetry.last?.completionConfidence
  };
}
var hybridSilence = {
  lastSpeechAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
  lastSpeechActivityAtMs: 0,
  speechHoldUntilMs: 0,
  pausedBySilence: false,
  timeoutId: null,
  erroredOnce: false,
  offScriptActive: false
};
var offScriptSinceMs = null;
var offScriptDurationMs = 0;
var hybridSilence2 = 0;
var HYBRID_CTRL_DEBUG_THROTTLE_MS = 500;
var lastHybridCtrlDebugTs = 0;
var HYBRID_TRUTH_THROTTLE_MS = 350;
var lastHybridTruthAt = 0;
var HYBRID_OFFSCRIPT_HUD_THROTTLE_MS = 350;
var lastHybridOffScriptHudAt = 0;
function setHybridSilence2(v) {
  hybridSilence2 = Number.isFinite(v) ? v : 0;
}
function resetOffScriptDuration() {
  offScriptSinceMs = null;
  offScriptDurationMs = 0;
}
function syncOffScriptDuration(now2 = nowMs()) {
  if (hybridSilence.offScriptActive) {
    if (offScriptSinceMs == null) {
      offScriptSinceMs = now2;
      offScriptDurationMs = 0;
      return;
    }
    offScriptDurationMs = Math.max(0, now2 - offScriptSinceMs);
    return;
  }
  resetOffScriptDuration();
}
function computeOffScriptDecay(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (durationMs < OFFSCRIPT_DECAY_T1_MS) return 1;
  if (durationMs < OFFSCRIPT_DECAY_T2_MS) return 0.5;
  if (durationMs < OFFSCRIPT_DECAY_T3_MS) return 0.25;
  if (durationMs < OFFSCRIPT_DECAY_T4_MS) return OFFSCRIPT_DECAY_CRAWL;
  return 0;
}
function logHybridOffScriptHud(payload) {
  const now2 = nowMs();
  if (now2 - lastHybridOffScriptHudAt < HYBRID_OFFSCRIPT_HUD_THROTTLE_MS) return;
  lastHybridOffScriptHudAt = now2;
  try {
    window?.HUD?.log?.("HYBRID_OFFSCRIPT", payload);
  } catch {
  }
}
function resetAsrIntentState(reason) {
  committedBlockIdx = -1;
  lastCommitAt = 0;
  lastCandidate = -1;
  stableSince = 0;
  asrMotorConflictLogged = false;
  if (reason) {
    try {
      console.debug("[ASR_INTENT] reset", { reason });
    } catch {
    }
  }
}
var profileStore = hasSupabaseConfig ? new ProfileStore(supabase) : null;
var profilePersister = profileStore ? createProfilePersister(profileStore) : null;
function persistProfilePatch(patch) {
  profilePersister?.persist(patch);
}
function flushProfilePersister() {
  profilePersister?.flush();
}
try {
  if (typeof window !== "undefined") {
    window.addEventListener("tp:typographyChanged", (ev) => {
      try {
        const detail = ev?.detail || {};
        if (detail.broadcast) return;
        const display = detail.display === "display" ? "display" : "main";
        const settings = detail.settings;
        if (!settings || typeof settings !== "object") return;
        persistProfilePatch({
          ui: {
            windows: {
              [display]: {
                typography: settings
              }
            }
          }
        });
      } catch {
      }
    });
  }
} catch {
}
function warnScrollWrite(payload) {
  if (scrollWriteWarned) return;
  scrollWriteWarned = true;
  try {
    console.warn("[AUTO] SCROLL_WRITE_FAILED", payload);
  } catch {
  }
}
var nowMs = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
var KNOWN_SCROLL_MODES = /* @__PURE__ */ new Set([
  "hybrid",
  "timed",
  "wpm",
  "asr",
  "step",
  "rehearsal"
]);
function normalizeScrollModeValue(value) {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw === "manual" || raw === "off") return "step";
  if (raw === "auto") return "timed";
  return KNOWN_SCROLL_MODES.has(raw) ? raw : null;
}
function getScrollMode2() {
  try {
    const w2 = typeof window !== "undefined" ? window : null;
    const override = normalizeScrollModeValue(w2?.__tpModeOverride);
    if (override) return override;
    const store2 = w2?.__tpStore || appStoreSingleton;
    const storeMode = normalizeScrollModeValue(store2?.get?.("scrollMode"));
    if (storeMode) return storeMode;
    const uiMode = normalizeScrollModeValue(w2?.__tpUiScrollMode);
    if (uiMode) return uiMode;
    const legacyMode = normalizeScrollModeValue(w2?.__tpScrollMode);
    if (legacyMode) return legacyMode;
    const mode = normalizeScrollModeValue(state22?.mode);
    if (mode) return mode;
  } catch {
  }
  return "hybrid";
}
function normalizePerfTimestamp(candidate, referenceNow = nowMs()) {
  const perfNow = Number.isFinite(referenceNow) ? referenceNow : nowMs();
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0) {
    return perfNow;
  }
  if (candidate > perfNow + 5e3) {
    return perfNow;
  }
  return candidate;
}
function resolveCurrentBlockIdx() {
  try {
    const anchorIdx = computeAnchorLineIndex2(scrollerEl || void 0);
    if (!Number.isFinite(anchorIdx)) return null;
    const idx = Math.max(0, Math.floor(anchorIdx));
    const selector = `.line[data-i="${idx}"], .line[data-index="${idx}"], .line[data-line="${idx}"], .line[data-line-idx="${idx}"]`;
    const lineEl = document.getElementById(`tp-line-${idx}`) || document.querySelector(selector);
    const blockEl = lineEl?.closest?.(".tp-asr-block");
    const raw = blockEl?.dataset?.tpBlock;
    const blockIdx = Number(raw);
    return Number.isFinite(blockIdx) ? blockIdx : null;
  } catch {
    return null;
  }
}
function runHybridVelocity(silence = hybridSilence) {
  const mode = getScrollMode2();
  if (mode !== "hybrid") {
    if (state22.mode !== mode) state22.mode = mode;
    assertHybridStoppedIfNotHybrid("runHybridVelocity");
    return;
  }
  if (state22.mode !== "hybrid") state22.mode = "hybrid";
  const target = typeof window !== "undefined" ? window : globalThis;
  const fn = target.__tpApplyHybridVelocity;
  if (typeof fn === "function") {
    fn(silence);
    return;
  }
  if (typeof applyHybridVelocityCore === "function") {
    applyHybridVelocityCore(silence);
  }
}
function getMarkerPercent() {
  try {
    if (typeof window === "undefined") return 0.4;
    const pct = window.__TP_MARKER_PCT;
    return Number.isFinite(pct) ? pct : 0.4;
  } catch {
    return 0.4;
  }
}
function getMarkerLineIndex(scroller = scrollerEl, markerY = null) {
  try {
    const toCheck = scroller ?? void 0;
    const anchorIdx = computeAnchorLineIndex2(toCheck);
    if (Number.isFinite(anchorIdx)) {
      return Math.max(0, Math.floor(anchorIdx));
    }
  } catch {
  }
  if (!scroller || markerY == null || !Number.isFinite(markerY)) return null;
  const linePx = getLinePx();
  if (!Number.isFinite(linePx) || linePx <= 0) return null;
  return Math.max(0, Math.round(markerY / linePx));
}
function computeHybridErrorPx(now2 = nowMs()) {
  const scroller = scrollerEl;
  const hint = hybridTargetHintState;
  if (!scroller || !hint) return null;
  const currentScrollTop = scroller.scrollTop || 0;
  const height = scroller.clientHeight || 0;
  const markerPct = Number.isFinite(hint.markerPct ?? NaN) && hint.markerPct != null ? hint.markerPct : getMarkerPercent();
  const markerY = currentScrollTop + height * markerPct;
  const anchorTopRaw = Number(hint.anchorTop);
  const hasAnchorTop = Number.isFinite(anchorTopRaw);
  const hintTopRaw = Number(hint.top);
  const hasHintTop = Number.isFinite(hintTopRaw);
  let targetTop = null;
  let targetTopSource = "none";
  if (hasAnchorTop) {
    targetTop = anchorTopRaw;
    targetTopSource = "anchor";
  } else if (hasHintTop) {
    targetTop = hintTopRaw;
    targetTopSource = "hint";
  } else if (Number.isFinite(hybridLastGoodTargetTop ?? NaN)) {
    targetTop = hybridLastGoodTargetTop;
    targetTopSource = "sticky";
  } else {
    targetTopSource = "none";
  }
  if (targetTop == null) return null;
  const anchorY = targetTop;
  const errorPx = anchorY - markerY;
  const anchorAgeMs = Math.max(0, now2 - hint.ts);
  const markerIdx = getMarkerLineIndex(scroller, markerY);
  const fallbackBestIdx = Number.isFinite(lastAsrMatch.bestIndex) && lastAsrMatch.bestIndex >= 0 ? lastAsrMatch.bestIndex : null;
  const bestIdx = Number.isFinite(hint.lineIndex ?? NaN) && hint.lineIndex != null ? hint.lineIndex : fallbackBestIdx;
  const errorLines = bestIdx != null && markerIdx != null ? bestIdx - markerIdx : null;
  return {
    errorPx,
    targetScrollTop: targetTop,
    currentScrollTop,
    confidence: hint.confidence,
    anchorAgeMs,
    anchorTop: anchorY,
    markerY,
    markerIdx,
    bestIdx,
    errorLines,
    targetTopSource
  };
}
function getSilenceMs(now2 = nowMs()) {
  const lastSpeech = hybridSilence.lastSpeechAtMs ?? now2;
  return Math.max(0, now2 - lastSpeech);
}
function getHybridSpeechHoldRemainingMs(now2 = nowMs()) {
  const holdUntil = Number(hybridSilence.speechHoldUntilMs);
  if (!Number.isFinite(holdUntil) || holdUntil <= 0) return 0;
  return Math.max(0, holdUntil - now2);
}
function isHybridSpeechPresent(now2 = nowMs()) {
  if (speechActive) return true;
  if (getHybridSpeechHoldRemainingMs(now2) > 0) return true;
  if (!(hybridSilence.lastSpeechActivityAtMs > 0)) return false;
  return Math.max(0, now2 - hybridSilence.lastSpeechActivityAtMs) <= HYBRID_SPEECH_PRESENT_HOLD_MS;
}
function markHybridSpeechPresent(now2 = nowMs()) {
  hybridSilence.lastSpeechActivityAtMs = now2;
  hybridSilence.speechHoldUntilMs = Math.max(
    hybridSilence.speechHoldUntilMs || 0,
    now2 + HYBRID_SPEECH_PRESENT_HOLD_MS
  );
}
function getHybridSpeedSettingRaw() {
  try {
    const slider = document.getElementById("wpmTarget");
    const sliderRaw = Number(slider?.value);
    if (Number.isFinite(sliderRaw) && sliderRaw > 0) return sliderRaw;
  } catch {
  }
  try {
    const storedRaw = Number(localStorage.getItem("tp_baseline_wpm"));
    if (Number.isFinite(storedRaw) && storedRaw > 0) return storedRaw;
  } catch {
  }
  try {
    const storeVal = Number(appStoreSingleton.get("wpmTarget"));
    if (Number.isFinite(storeVal) && storeVal > 0) return storeVal;
  } catch {
  }
  return null;
}
function getHybridWpmCalibrationMultiplier() {
  let raw = null;
  try {
    const overrideRaw = Number(window.__TP_HYBRID_WPM_CAL_MULT);
    if (Number.isFinite(overrideRaw) && overrideRaw > 0) {
      raw = overrideRaw;
    }
  } catch {
  }
  if (raw == null) {
    try {
      const storedRaw = Number(localStorage.getItem("tp_hybrid_wpm_cal_mult"));
      if (Number.isFinite(storedRaw) && storedRaw > 0) {
        raw = storedRaw;
      }
    } catch {
    }
  }
  const resolved = raw ?? HYBRID_WPM_CAL_MULT_DEFAULT;
  return Math.max(HYBRID_WPM_CAL_MULT_MIN, Math.min(HYBRID_WPM_CAL_MULT_MAX, resolved));
}
function evaluateHybridEligibility(now2 = nowMs()) {
  if (state22.mode !== "hybrid") return { eligible: false, reason: "mode" };
  if (getHybridSessionPhase() !== "live") return { eligible: false, reason: "phase" };
  const hint = hybridTargetHintState;
  if (!hint) return { eligible: false, reason: "no-hint" };
  if (hint.confidence < HYBRID_CTRL_CONF_MIN) return { eligible: false, reason: "low-confidence" };
  if (now2 - hint.ts > HYBRID_CTRL_ANCHOR_RECENCY_MS) return { eligible: false, reason: "stale-hint" };
  return { eligible: true, reason: "ok" };
}
function logHybridCtrlState(basePxps, baseWithCorrection, now2, errorInfo, silenceMs, eligible, eligibleReason, normalizedError, targetMult, targetMultSource, lineTargetMult, lineMult, appliedTargetMult, silenceCap, offScriptSeverity, offScriptCap, finalPxps, ctrlMultApplied, effectiveScaleApplied, modeHint) {
  if (!isDevMode2()) return;
  if (!HYBRID_CTRL_ENABLED) return;
  if (now2 - lastHybridCtrlLogAt < HYBRID_CTRL_LOG_THROTTLE_MS) return;
  lastHybridCtrlLogAt = now2;
  try {
    console.info("[HYBRID_CTRL]", {
      errorPx: errorInfo?.errorPx ?? null,
      anchorY: errorInfo?.anchorY ?? null,
      currentScrollTop: errorInfo?.currentScrollTop ?? null,
      targetScrollTop: errorInfo?.targetScrollTop ?? null,
      markerY: null,
      confidence: errorInfo?.confidence ?? null,
      anchorAgeMs: errorInfo?.anchorAgeMs ?? null,
      silenceMs,
      eligible,
      eligibleReason,
      basePxps,
      baseWithCorrection,
      normalizedError,
      targetMult,
      appliedTargetMult,
      silenceCap,
      offScriptSeverity,
      offScriptCap,
      hybridMult: hybridCtrl.mult,
      finalPxps,
      ctrlMultApplied,
      effectiveScaleApplied,
      modeHint,
      targetMultSource,
      lineTargetMult,
      lineMult,
      errorLines: errorInfo?.errorLines ?? null,
      markerIdx: errorInfo?.markerIdx ?? null,
      bestIdx: errorInfo?.bestIdx ?? null,
      writerSource: getLastWriterSource()
    });
  } catch {
  }
}
function logHybridMultDebug(payload) {
  if (!isDevMode2()) return;
  if (!HYBRID_CTRL_ENABLED) return;
  const now2 = nowMs();
  if (now2 - lastHybridMultDebugAt < HYBRID_MULT_DEBUG_THROTTLE_MS) return;
  lastHybridMultDebugAt = now2;
  const fmt = (value, digits = 2) => value == null || !Number.isFinite(value) ? null : value.toFixed(digits);
  try {
    console.info("[HYBRID_CTRL] mult-debug", {
      basePxps: fmt(payload.basePxps),
      errorLines: fmt(payload.errorLines),
      targetMult: fmt(payload.targetMult, 3),
      lineMult: fmt(payload.lineMult, 3),
      finalPxps: fmt(payload.finalPxps),
      capReason: payload.capReason ?? "none"
    });
  } catch {
  }
}
function logHybridTruthLine(payload) {
  if (!isDevMode2()) return;
  const now2 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  if (now2 - lastHybridTruthAt < HYBRID_TRUTH_THROTTLE_MS) return;
  lastHybridTruthAt = now2;
  const fmt = (value, digits) => value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
  try {
    const truthPayload = {
      basePxps: fmt(payload.basePxps, 2),
      finalPxps: fmt(payload.finalPxps, 2),
      errorPx: fmt(payload.errorPx, 1),
      errorLines: fmt(payload.errorLines, 2),
      effectiveErrorLines: fmt(payload.effectiveErrorLines, 2),
      targetMult: fmt(payload.targetMult, 3),
      lineMult: fmt(payload.lineMult, 3),
      capReason: payload.capReason ?? "none",
      scaleReason: payload.scaleReason ?? null,
      weakMatch: payload.weakMatch ?? null,
      driftWeak: payload.driftWeak ?? null,
      bestSim: fmt(payload.bestSim, 3),
      offScriptActive: payload.offScriptActive ?? null,
      noMatch: payload.noMatch ?? null,
      sawNoMatch: payload.sawNoMatch ?? null,
      hardNoMatch: payload.hardNoMatch ?? null,
      targetTopSource: payload.targetTopSource ?? null
    };
    console.warn("[HYBRID_TRUTH]", JSON.stringify(truthPayload));
  } catch {
  }
}
function formatHudNumber(value, digits = 2) {
  const num2 = Number(value);
  return Number.isFinite(num2) ? num2.toFixed(digits) : "n/a";
}
function computeHybridModeHint(errorLines, weakMatch) {
  if (weakMatch) return "WEAK MATCH";
  const lines = Number.isFinite(errorLines ?? NaN) ? Number(errorLines) : null;
  if (lines == null || Math.abs(lines) <= HYBRID_CTRL_MODE_DEADBAND_LINES) {
    return "ON TARGET";
  }
  return lines > 0 ? "CATCHING UP" : "LETTING YOU CATCH UP";
}
function renderHybridCtrlHud(state3) {
  if (!HYBRID_CTRL_ENABLED) return;
  if (typeof document === "undefined") return;
  const container = document.body || document.documentElement;
  if (!container) return;
  let hud = document.getElementById("tpHybridHud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "tpHybridHud";
    hud.style.position = "fixed";
    hud.style.bottom = "var(--tp-ui-pad-sm)";
    hud.style.right = "var(--tp-ui-pad-sm)";
    hud.style.zIndex = "2147483647";
    hud.style.padding = "calc(6px * var(--tp-ui-scale)) calc(8px * var(--tp-ui-scale))";
    hud.style.fontSize = "var(--tp-ui-font-xs)";
    hud.style.fontFamily = "system-ui, sans-serif";
    hud.style.background = "rgba(0, 0, 0, 0.65)";
    hud.style.color = "#fff";
    hud.style.borderRadius = "calc(4px * var(--tp-ui-scale))";
    hud.style.pointerEvents = "none";
    hud.style.whiteSpace = "nowrap";
    container.appendChild(hud);
  }
  const parts = [
    `mode=${state3.modeHint}`,
    `target=${formatHudNumber(state3.targetTop, 1)}`,
    `curr=${formatHudNumber(state3.currentTop, 1)}`,
    `err=${formatHudNumber(state3.errorPx, 1)}`,
    `errLines=${formatHudNumber(state3.errorLines, 1)}`,
    `markerIdx=${formatHudNumber(state3.markerIdx, 0)}`,
    `bestIdx=${formatHudNumber(state3.bestIdx, 0)}`,
    `lineTarget=${formatHudNumber(state3.lineTargetMult, 2)}`,
    `lineMult=${formatHudNumber(state3.lineMult, 2)}`,
    `lineSrc=${state3.lineSource}`,
    `base=${formatHudNumber(state3.basePxps, 1)}`,
    `baseCorr=${formatHudNumber(state3.baseWithCorrection, 1)}`,
    `mult=${formatHudNumber(state3.mult, 2)}`,
    `ctrl=${formatHudNumber(state3.ctrlMultApplied, 2)}`,
    `scale=${formatHudNumber(state3.effectiveScaleApplied, 2)}`,
    `final=${formatHudNumber(state3.finalPxps, 1)}`,
    `silence=${formatHudNumber(state3.silenceMs, 0)}ms`,
    `silenceCap=${formatHudNumber(state3.silenceCap, 2)}`,
    `off=${formatHudNumber(state3.offScriptSeverity, 2)}`,
    `offCap=${formatHudNumber(state3.offScriptCap, 2)}`,
    `eligible=${state3.eligible ? "yes" : "no"}(${state3.eligibleReason})`,
    `writer=${state3.writerSource ?? "n/a"}`
  ];
  hud.textContent = parts.join(" | ");
}
function getLastWriterSource() {
  try {
    const scroller = scrollerEl;
    const datasetSource = scroller?.dataset?.tpLastWriter;
    if (datasetSource) return datasetSource;
    const globalWriter = window.__tpLastWriter;
    if (globalWriter && typeof globalWriter.from === "string") {
      return globalWriter.from;
    }
  } catch {
  }
  return null;
}
function classifyProgrammaticWriterKind(source, modeHint = null) {
  const raw = String(source || "").toLowerCase();
  const mode = String(modeHint || "").toLowerCase();
  if (raw.includes("asr") || mode === "asr") return "asr";
  if (raw.includes("writer") || raw.includes("programmatic") || raw.includes("scrollwrite")) {
    return "writer";
  }
  return "other";
}
function noteProgrammaticWriterStamp(source, kind, at = nowMs()) {
  if (kind === "other") return;
  lastProgrammaticWriterStamp = {
    at,
    source: String(source || "programmatic"),
    kind
  };
}
function getRecentProgrammaticWriterStamp(scroller, now2 = nowMs()) {
  try {
    const w2 = window;
    const source = String(scroller?.dataset?.tpLastWriter || "");
    const globalWriter = w2?.__tpLastWriter;
    const globalFrom = typeof globalWriter?.from === "string" ? globalWriter.from : "";
    const globalAt = Number(globalWriter?.at);
    if (Number.isFinite(globalAt) && now2 - globalAt <= PROGRAMMATIC_WRITER_GRACE_MS) {
      const kind = classifyProgrammaticWriterKind(globalFrom || source, getScrollMode2());
      noteProgrammaticWriterStamp(globalFrom || source || "writer", kind, globalAt);
    } else if (w2?.__tpScrollWriteActive === true) {
      const activeSource = source || globalFrom || "writer-active";
      const kind = classifyProgrammaticWriterKind(activeSource, getScrollMode2());
      noteProgrammaticWriterStamp(activeSource, kind, now2);
    } else if (state22.mode === "asr" && source) {
      const kind = classifyProgrammaticWriterKind(source, "asr");
      noteProgrammaticWriterStamp(source, kind, now2);
    }
  } catch {
  }
  if (!lastProgrammaticWriterStamp) return null;
  if (now2 - lastProgrammaticWriterStamp.at > PROGRAMMATIC_WRITER_GRACE_MS) return null;
  return lastProgrammaticWriterStamp;
}
function getLinePx() {
  try {
    const metrics = getViewportMetrics(() => scrollerEl);
    return Number.isFinite(metrics.pxPerLine) && metrics.pxPerLine > 0 ? metrics.pxPerLine : HYBRID_CTRL_LINE_PX_DEFAULT;
  } catch {
    return HYBRID_CTRL_LINE_PX_DEFAULT;
  }
}
function normalizeHybridError(errorPx) {
  const linePx = getLinePx();
  const bandPx = linePx * 1.5;
  const deadbandPx = linePx * 0.45;
  if (Math.abs(errorPx) < deadbandPx) return 0;
  return clamp2(errorPx / bandPx, -1, 1);
}
function computeOffScriptSeverity() {
  const bestSim = Number.isFinite(lastAsrMatch?.bestSim ?? NaN) ? lastAsrMatch.bestSim : NaN;
  const simSeverity = Number.isFinite(bestSim) && bestSim < HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD ? (HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD - bestSim) / HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD : 0;
  const deltaLines = Number.isFinite(lastAsrMatch?.bestIndex) && Number.isFinite(lastAsrMatch?.currentIndex) ? Math.abs(lastAsrMatch.bestIndex - lastAsrMatch.currentIndex) : 0;
  const deltaSeverity = clamp2(deltaLines / HYBRID_CTRL_OFFSCRIPT_LINE_DELTA, 0, 1);
  return Math.min(1, Math.max(simSeverity, deltaSeverity));
}
function computeTargetMultiplier(e) {
  const raw = 1 + HYBRID_CTRL_KP * e;
  return clamp2(raw, HYBRID_CTRL_BRAKE_MIN, HYBRID_CTRL_ASSIST_MAX);
}
function mapErrorLinesToTargetMult(errorLines, deadbandLines, maxErrLines, minMult, maxMult) {
  if (!Number.isFinite(errorLines)) return 1;
  if (maxErrLines <= deadbandLines) return 1;
  const abs = Math.abs(errorLines);
  if (abs <= deadbandLines) return 1;
  const normalized = clamp2((abs - deadbandLines) / (maxErrLines - deadbandLines), 0, 1);
  const shaped = Math.pow(Math.min(Math.max(normalized, 0), 1), HYBRID_CTRL_LINE_CURVE_EXP);
  if (errorLines > 0) {
    const delta2 = Math.min(HYBRID_CTRL_LINE_POS_MULT_DELTA, 1 - minMult);
    return clamp2(1 - shaped * delta2, minMult, 1);
  }
  const delta = Math.min(HYBRID_CTRL_LINE_NEG_MULT_DELTA, maxMult - 1);
  return clamp2(1 + shaped * delta, 1, maxMult);
}
function computeLineTargetMultiplier(errorLines, eligible) {
  if (!eligible || errorLines == null || !Number.isFinite(errorLines)) return null;
  return mapErrorLinesToTargetMult(
    errorLines,
    HYBRID_CTRL_MODE_DEADBAND_LINES,
    HYBRID_CTRL_LINE_ERROR_RANGE,
    HYBRID_CTRL_LINE_MIN_MULT,
    HYBRID_CTRL_LINE_MAX_MULT
  );
}
function updateHybridLineMult(targetMult, dtMs, allowFastUp = false) {
  const current = Number.isFinite(hybridCtrl.lineMult) ? hybridCtrl.lineMult : 1;
  const target = Number.isFinite(targetMult ?? NaN) ? Number(targetMult) : 1;
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    hybridCtrl.lineMult = target;
    return hybridCtrl.lineMult;
  }
  const alpha = 1 - Math.exp(-dtMs / HYBRID_CTRL_LINE_SMOOTH_TAU_MS);
  const next = current + (target - current) * alpha;
  const maxDeltaDown = HYBRID_CTRL_LINE_RATE_LIMIT_PER_SEC * (dtMs / 1e3);
  const maxDeltaUp = HYBRID_CTRL_LINE_RATE_LIMIT_PER_SEC * (dtMs / 1e3) * (allowFastUp ? HYBRID_CTRL_LINE_RATE_LIMIT_BEHIND_MULT : 1);
  const limited = clamp2(next, current - maxDeltaDown, current + maxDeltaUp);
  hybridCtrl.lineMult = Number.isFinite(limited) ? limited : current;
  return hybridCtrl.lineMult;
}
function computeSilenceCapMultiplier(silenceMs) {
  if (silenceMs > HYBRID_CTRL_SILENCE_LONG_MS) {
    return HYBRID_CTRL_SILENCE_LONG_CAP;
  }
  if (silenceMs > HYBRID_CTRL_SILENCE_SHORT_MS) {
    return HYBRID_CTRL_SILENCE_SHORT_CAP;
  }
  return 1;
}
var hybridProgrammaticScrollUntilMs = 0;
function markHybridProgrammaticScroll(durationMs = 80) {
  hybridProgrammaticScrollUntilMs = nowMs() + durationMs;
}
function isHybridProgrammaticScroll() {
  return nowMs() < hybridProgrammaticScrollUntilMs;
}
function clearHybridSilenceTimer() {
  if (hybridSilence.timeoutId != null) {
    try {
      window.clearTimeout(hybridSilence.timeoutId);
    } catch {
    }
    hybridSilence.timeoutId = null;
  }
}
var tpLastWriter = null;
function describeEl(el) {
  if (!el) {
    return {
      tag: "null",
      id: null,
      cls: null
    };
  }
  const e = el;
  return {
    tag: (e.tagName || "unknown").toLowerCase(),
    id: e.id || null,
    cls: e.className && String(e.className) || null
  };
}
function scrollWrite(y, meta2) {
  if (!isMainViewer()) {
    try {
      console.warn("[SCROLL_WRITE] denied (display role)", { y, meta: meta2 });
    } catch {
    }
    return false;
  }
  const target = viewer ?? scrollerEl ?? (typeof document !== "undefined" ? document.getElementById("viewer") : null);
  const targetInfo = describeEl(target);
  const beforeTop = target?.scrollTop ?? null;
  const requestedTop = y;
  let ok = false;
  try {
    const writeFn = window.__tpScrollWrite;
    if (typeof writeFn === "function") {
      writeFn(y);
      ok = true;
    } else if (target) {
      applyCanonicalScrollTop(y, {
        scroller: target,
        reason: meta2.reason ?? "router-scroll-write-fallback",
        source: meta2.from || "router-scroll-write-fallback"
      });
      ok = true;
    }
  } catch (err) {
    try {
      console.error("[SCROLL_WRITE] exception", { y, meta: meta2, err });
    } catch {
    }
  }
  const afterTop = target?.scrollTop ?? null;
  const writeAt = nowMs();
  tpLastWriter = { from: meta2.from, at: writeAt, y };
  try {
    window.__tpLastWriter = tpLastWriter;
  } catch {
  }
  const stampSource = meta2.reason || meta2.from || "writer";
  const stampKind = classifyProgrammaticWriterKind(stampSource, getScrollMode2());
  noteProgrammaticWriterStamp(stampSource, stampKind, writeAt);
  try {
    console.info("[SCROLL_WRITE]", {
      ok,
      from: meta2.from,
      reason: meta2.reason ?? null,
      before: beforeTop,
      y,
      after: afterTop
    });
  } catch {
  }
  const debugStack = isDevMode2() ? new Error().stack || null : null;
  if (target && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    const targetEl = target;
    window.requestAnimationFrame(() => {
      const afterTopRaf = targetEl.scrollTop ?? null;
      const changedNow = beforeTop != null && afterTop != null ? afterTop !== beforeTop : null;
      const snappedBack = afterTop != null && afterTopRaf != null ? afterTopRaf !== afterTop : null;
      try {
        console.warn("[SCROLL_WRITE_TRUTH]", {
          from: meta2.from,
          reason: meta2.reason ?? null,
          target: targetInfo,
          beforeTop,
          requestedTop,
          afterTop,
          afterTopRaf,
          changedNow,
          snappedBack,
          stack: debugStack
        });
      } catch {
      }
    });
  }
  return ok;
}
function beginHybridLiveGraceWindow() {
  if (state22.mode !== "hybrid") return;
  const now2 = nowMs();
  seedHybridBaseSpeed();
  setHybridScale(RECOVERY_SCALE);
  liveGraceWindowEndsAt = now2 + LIVE_GRACE_MS;
  hybridSilence.lastSpeechAtMs = now2;
  hybridSilence.pausedBySilence = false;
  clearHybridSilenceTimer();
  if (hybridWantedRunning) {
    armHybridSilenceTimer(LIVE_GRACE_MS);
  }
  const effectivePxps = Number.isFinite(hybridBasePxps) ? hybridBasePxps * hybridScale : 0;
  try {
    console.info("[HYBRID] live boot", {
      hybridBasePxps,
      phase: sessionPhase,
      hybridWantedRunning,
      lastSpeechAgeMs: 0,
      effectivePxps,
      scale: hybridScale,
      isSilent: false
    });
  } catch {
  }
}
function createVadEventAdapter() {
  let ready = false;
  let error;
  const subs22 = /* @__PURE__ */ new Set();
  let unsub = null;
  function status() {
    return { kind: "vad", ready, error };
  }
  async function start() {
    try {
      if (unsub) return;
      const onEv = (e) => {
        try {
          const d = e?.detail || {};
          const f = { kind: "gate", speaking: !!d.speaking, rmsDbfs: Number(d.rmsDbfs) || -60 };
          subs22.forEach((fn) => {
            try {
              fn(f);
            } catch {
            }
          });
        } catch {
        }
      };
      const h = onEv;
      window.addEventListener("tp:vad", h);
      unsub = () => {
        try {
          window.removeEventListener("tp:vad", h);
        } catch {
        }
      };
      ready = true;
    } catch (e) {
      error = String(e?.message || e);
      ready = false;
    }
  }
  async function stop2() {
    try {
      unsub?.();
      unsub = null;
    } catch {
    }
    ready = false;
  }
  function onFeature(fn) {
    subs22.add(fn);
    return () => subs22.delete(fn);
  }
  return { start, stop: stop2, onFeature, status };
}
function createFeatureSynth() {
  const TOK_WIN_MS = 5e3;
  let toks = [];
  let lastTokensKey = "";
  let speakingWanted = false;
  let speaking2 = false;
  let lastSpeakChange = 0;
  const ATTACK_MS = 80, RELEASE_MS = 300;
  let lastActivityMs = performance.now();
  let wpmEma;
  const ALPHA = 0.3;
  function dedupeKey(list) {
    return list.map((x) => x.text).join("|");
  }
  function wordsInWindow(now2) {
    const start = now2 - TOK_WIN_MS;
    toks = toks.filter((t) => t.t >= start);
    let words = 0;
    for (const t of toks) {
      words += (t.text || "").trim().split(/\s+/).filter(Boolean).length;
    }
    return words;
  }
  function push(f) {
    const now2 = performance.now();
    if (f.kind === "tokens") {
      const key = dedupeKey(f.tokens);
      if (f.final || key !== lastTokensKey) {
        lastTokensKey = key;
        for (const tk of f.tokens) {
          toks.push({ text: tk.text, t: now2 });
        }
        lastActivityMs = now2;
        speakingWanted = true;
      }
    } else if (f.kind === "gate") {
      speakingWanted = !!f.speaking;
      if (f.speaking) lastActivityMs = now2;
    }
    if (speakingWanted && !speaking2) {
      if (now2 - lastSpeakChange >= ATTACK_MS) {
        speaking2 = true;
        lastSpeakChange = now2;
      }
    } else if (!speakingWanted && speaking2) {
      if (now2 - lastSpeakChange >= RELEASE_MS) {
        speaking2 = false;
        lastSpeakChange = now2;
      }
    }
    const words = wordsInWindow(now2);
    const instWpm = words * 60 * (1e3 / TOK_WIN_MS);
    if (words > 0) {
      wpmEma = wpmEma == null ? instWpm : ALPHA * instWpm + (1 - ALPHA) * wpmEma;
    }
  }
  function getTempo() {
    const now2 = performance.now();
    const pauseMs = Math.max(0, now2 - lastActivityMs);
    return { wpm: wpmEma, pauseMs };
  }
  function getSpeaking() {
    return speaking2;
  }
  return { push, getTempo, getSpeaking };
}
function createAutoMotor() {
  const brain = getScrollBrain();
  const timed = createTimedEngine(brain);
  let enabled = false;
  let currentSpeed = 0;
  let rafId2 = null;
  let lastTs = 0;
  let lastTickMoved = false;
  let carry = 0;
  const AUTO_TICK_DEBUG_MS = 3e3;
  const AUTO_TICK_LOG_THROTTLE_MS = 250;
  let autoTickDebugStart = 0;
  let lastAutoTickLogAt = 0;
  function formatScroller(el) {
    if (!el) return "none";
    const tag = el.tagName?.toLowerCase() || "el";
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className ? `.${String(el.className).replace(/\s+/g, ".")}` : "";
    return `${tag}${id}${classes}`;
  }
  function logAutoTick(event, el, pxPerSec, dtSec, reason, extra = {}) {
    if (!isDevMode2()) return;
    const now2 = nowMs();
    if (autoTickDebugStart === 0) {
      autoTickDebugStart = now2;
    }
    if (now2 - autoTickDebugStart > AUTO_TICK_DEBUG_MS) return;
    if (now2 - lastAutoTickLogAt < AUTO_TICK_LOG_THROTTLE_MS) return;
    lastAutoTickLogAt = now2;
    try {
      const payload = {
        event,
        scroller: formatScroller(el),
        pxPerSec,
        dtSec,
        reason,
        scrollTop: el?.scrollTop ?? null,
        scrollHeight: el?.scrollHeight ?? null,
        clientHeight: el?.clientHeight ?? null,
        ...extra
      };
      try {
        window.__AUTO_DEBUG__ ??= [];
        window.__AUTO_DEBUG__.push(payload);
      } catch {
      }
      console.warn("[AUTO_DEBUG]", payload);
    } catch {
    }
  }
  function setEnabled(on) {
    try {
      if (on) {
        timed.enable();
      } else {
        timed.disable();
      }
      enabled = !!on;
    } catch {
    }
  }
  function setSpeed(pxs) {
    const next = typeof pxs === "number" ? pxs : Number(pxs);
    currentSpeed = Number.isFinite(next) ? next : 0;
    try {
      timed.setSpeedPxPerSec(currentSpeed);
    } catch {
    }
  }
  function setVelocity(pxs) {
    setSpeed(pxs);
  }
  function toggle() {
    if (enabled) {
      stop2();
    } else {
      start();
    }
  }
  function cancelTick() {
    if (rafId2 != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId2);
    }
    rafId2 = null;
  }
  function scheduleTick() {
    if (rafId2 != null) return;
    lastTs = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    rafId2 = typeof requestAnimationFrame === "function" ? requestAnimationFrame(motorTick) : null;
  }
  function motorTick(ts) {
    rafId2 = null;
    if (!enabled) return;
    const now2 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : ts || Date.now();
    const dtSec = lastTs ? Math.max(0, (now2 - lastTs) / 1e3) : 0;
    lastTs = now2;
    const pxPerSec = currentSpeed;
    const canonicalViewer = ensureViewerElement();
    if (canonicalViewer && scrollerEl !== canonicalViewer) {
      scrollerEl = canonicalViewer;
    }
    const el = canonicalViewer || scrollerEl;
    if (!el) {
      logAutoTick("tick", el, pxPerSec, dtSec, "no-element");
      scheduleTick();
      return;
    }
    if (!Number.isFinite(dtSec) || dtSec <= 0 || pxPerSec <= 0) {
      scheduleTick();
      return;
    }
    logAutoTick("tick", el, pxPerSec, dtSec, "pre-check");
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY || "")) {
      logAutoTick("tick", el, pxPerSec, dtSec, "overflow-blocked", { overflowY: style.overflowY });
      scheduleTick();
      return;
    }
    const totalScrollHeight = el.scrollHeight || 0;
    const viewportHeight = el.clientHeight || 0;
    const room = Math.max(0, totalScrollHeight - viewportHeight);
    if (room <= 0) {
      logAutoTick("tick", el, pxPerSec, dtSec, "no-room", { room });
      scheduleTick();
      return;
    }
    carry += pxPerSec * dtSec;
    const step = Math.trunc(carry);
    if (step <= 0) {
      scheduleTick();
      return;
    }
    carry -= step;
    const before = el.scrollTop || 0;
    const next = Math.min(room, before + step);
    markHybridProgrammaticScroll();
    el.scrollTop = next;
    const after = el.scrollTop || 0;
    if (after > before) {
      lastTickMoved = true;
      logAutoTick("tick", el, pxPerSec, dtSec, "moved", { delta: after - before });
    } else {
      warnScrollWrite({
        id: el.id,
        className: el.className,
        before,
        after,
        room,
        overflowY: style.overflowY,
        position: style.position
      });
    }
    scheduleTick();
  }
  function stop2() {
    setEnabled(false);
    cancelTick();
  }
  function start() {
    if (enabled) {
      if (rafId2 == null) {
        autoTickDebugStart = 0;
        lastAutoTickLogAt = 0;
        logAutoTick("start", viewer ?? scrollerEl, currentSpeed, 0, "already-enabled-resume");
        scheduleTick();
      }
      return;
    }
    setEnabled(true);
    lastTickMoved = false;
    carry = 0;
    autoTickDebugStart = 0;
    lastAutoTickLogAt = 0;
    logAutoTick("start", viewer ?? scrollerEl, currentSpeed, 0, "enabled");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!enabled) return;
        scheduleTick();
      });
    });
  }
  function isRunning() {
    return enabled && lastTickMoved;
  }
  function getState() {
    return { enabled, speed: currentSpeed };
  }
  function tick(_now) {
    motorTick(_now);
  }
  return { setEnabled, setSpeed, setVelocity, stop: stop2, toggle, getState, tick, start, isRunning };
}
var HYBRID_LOG_THROTTLE_MS = 500;
var HYBRID_VERBOSE_FLAG = "hybrid-dev";
var HYBRID_TRACE_FLAG = "hybridTrace";
var lastHybridScaleLogAt = 0;
var lastHybridPaceLogAt = 0;
var lastHybridBrakeLogAt = 0;
var lastHybridVelocityLogAt = 0;
var HYBRID_MOTOR_LOG_THROTTLE_MS = 500;
var lastHybridMotorVelocityLogAt = 0;
var lastHybridMotorVelocitySignature = "";
var lastHybridBrakeSignature = "";
var lastHybridVelocitySignature = "";
var isHybridVerboseDevMode = (() => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get(HYBRID_VERBOSE_FLAG) === "1";
  } catch {
    return false;
  }
})();
var hybridTraceLastAt = /* @__PURE__ */ new Map();
var hybridTraceLastSig = /* @__PURE__ */ new Map();
function isHybridTraceEnabled() {
  if (!isDevMode2()) return false;
  if (typeof window === "undefined") return false;
  try {
    const w2 = window;
    if (w2.__TP_HYBRID_TRACE === true) return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get(HYBRID_TRACE_FLAG) === "1") return true;
    if (window.localStorage?.getItem("tp_hybrid_trace") === "1") return true;
  } catch {
  }
  return false;
}
function logHybridTrace(tag, payload, opts) {
  if (!isHybridTraceEnabled()) return;
  const throttleMs = Math.max(0, Number(opts?.throttleMs) || 0);
  const signature = typeof opts?.signature === "string" ? opts.signature : null;
  const now2 = nowMs();
  if (throttleMs > 0) {
    const lastAt = hybridTraceLastAt.get(tag) ?? 0;
    if (now2 - lastAt < throttleMs) return;
    hybridTraceLastAt.set(tag, now2);
  }
  if (signature) {
    const lastSig = hybridTraceLastSig.get(tag);
    if (lastSig === signature) return;
    hybridTraceLastSig.set(tag, signature);
  }
  try {
    console.info(`[HYBRID_TRACE] ${tag}`, payload);
  } catch {
  }
}
function logHybridPaceTelemetry(payload) {
  if (!isDevMode2()) return;
  const now2 = nowMs();
  if (now2 - lastHybridPaceLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridPaceLogAt = now2;
  const summary = {
    mode: payload.mode,
    wpm: payload.wpm,
    finalTarget: payload.finalTarget,
    accelCap: payload.accelCap
  };
  try {
    console.debug("[HYBRID_WPM]", summary);
  } catch {
  }
  if (isHybridVerboseDevMode) {
    try {
      console.debug(`[HYBRID_WPM] ${JSON.stringify(payload)}`);
    } catch {
    }
  }
}
function logHybridScaleDetail(obj) {
  if (!isDevMode2()) return;
  if (state22.mode !== "hybrid") return;
  const now2 = nowMs();
  if (now2 - lastHybridScaleLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridScaleLogAt = now2;
  const summary = {
    basePxps: obj.basePxps,
    chosenScale: obj.chosenScale,
    reason: obj.reason,
    graceActive: obj.graceActive,
    pauseLikely: !!obj.pauseLikely,
    offScriptActive: !!obj.offScriptActive,
    pausedBySilence: !!obj.pausedBySilence,
    onScriptStreak,
    onScriptLocked: !!obj.onScriptLocked
  };
  try {
    console.info("[HYBRID] scale detail", summary);
  } catch {
  }
  if (isHybridVerboseDevMode) {
    try {
      console.info(`[HYBRID] scale detail ${JSON.stringify(obj)}`);
    } catch {
    }
  }
}
function logHybridBrakeEvent(payload) {
  if (!isDevMode2()) return;
  if (state22.mode !== "hybrid") return;
  const now2 = nowMs();
  const ttl = Math.max(0, (payload.brakeExpiresAt ?? 0) - (payload.now ?? now2));
  const shouldLog = payload.graceActive || payload.brakeActive || ttl > 0;
  if (!shouldLog) return;
  const signature = `${payload.brakeFactor.toFixed(3)}|${payload.brakeReason ?? ""}|${payload.brakeActive ? "1" : "0"}|${payload.motorRunning ? "r" : "s"}`;
  const changed = signature !== lastHybridBrakeSignature;
  if (!changed && now2 - lastHybridBrakeLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridBrakeSignature = signature;
  lastHybridBrakeLogAt = now2;
  const desc = [
    `brake=${payload.brakeFactor.toFixed(3)}`,
    `ttl=${Math.round(ttl)}`,
    `reason=${payload.brakeReason ?? "none"}`
  ];
  if (payload.graceActive) desc.push("grace");
  try {
    console.info(`[HYBRID_BRAKE] ${desc.join(" ")}`, payload);
  } catch {
  }
}
function logHybridVelocityEvent(payload) {
  if (!isDevMode2()) return;
  if (state22.mode !== "hybrid") return;
  const meaningful = payload.motorRunning || payload.brakeTtl > 0 || payload.assistBoost > 0 || payload.graceActive || payload.chosenScale < 0.999;
  if (!meaningful) return;
  const now2 = nowMs();
  const signature = `${payload.velocity.toFixed(2)}|${payload.brakeFactor.toFixed(3)}|${payload.assistBoost.toFixed(3)}|${payload.reason}|${payload.brakeActive ? "b" : ""}|${payload.assistActive ? "a" : ""}|${payload.motorRunning ? "r" : "s"}`;
  const changed = signature !== lastHybridVelocitySignature;
  if (!changed && now2 - lastHybridVelocityLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridVelocitySignature = signature;
  lastHybridVelocityLogAt = now2;
  const clampState = payload.chosenScale < 0.999 ? "clamped" : "free";
  const summary = [
    `base=${payload.basePxps.toFixed(1)}`,
    `eff=${payload.velocity.toFixed(1)}`,
    `scale=${payload.chosenScale.toFixed(2)}`,
    `clamp=${clampState}`,
    `brake=${payload.brakeFactor.toFixed(2)}${payload.brakeActive ? ` ttl=${Math.round(payload.brakeTtl)}` : ""}`,
    `assist=${payload.assistBoost.toFixed(1)}${payload.assistActive ? ` ttl=${Math.round(payload.assistTtl)}` : ""}`,
    `reason=${payload.reason}`
  ];
  try {
    console.info(`[HYBRID_VELOCITY] ${summary.join(" ")}`, payload);
  } catch {
  }
}
function logHybridMotorEvent(evt, data) {
  if (!isDevMode2()) return;
  if (state22.mode !== "hybrid") return;
  if (evt === "velocity") {
    const now2 = nowMs();
    const signature = `${Number(data?.velocityPxPerSec ?? 0).toFixed(2)}`;
    if (signature === lastHybridMotorVelocitySignature && now2 - lastHybridMotorVelocityLogAt < HYBRID_MOTOR_LOG_THROTTLE_MS) return;
    lastHybridMotorVelocitySignature = signature;
    lastHybridMotorVelocityLogAt = now2;
  }
  if (evt === "dt-clamp") {
    const dtRaw = Number(data?.dtRaw ?? NaN);
    const dtClamped = Number(data?.dtClamped ?? NaN);
    if (Number.isFinite(dtRaw) && Number.isFinite(dtClamped)) {
      logHybridTrace(
        "motor_dt_clamp",
        {
          dtRaw: Number(dtRaw.toFixed(3)),
          dtClamped: Number(dtClamped.toFixed(3))
        },
        {
          throttleMs: 250,
          signature: `${dtRaw.toFixed(3)}|${dtClamped.toFixed(3)}`
        }
      );
    }
  }
  try {
    console.debug("[HybridMotor]", evt, data);
  } catch {
  }
}
function convertWpmToPxPerSec(targetWpm) {
  try {
    const doc = document.documentElement;
    const cs = getComputedStyle(doc);
    const fsPx = parseFloat(cs.getPropertyValue("--tp-font-size")) || DEFAULT_SCRIPT_FONT_PX;
    const lhScale = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
    const lineHeightPx = fsPx * lhScale;
    const wpl = parseFloat(localStorage.getItem("tp_wpl_hint") || "8") || 8;
    const basePxpsRaw = targetWpm / 60 / wpl * lineHeightPx;
    const mode = getScrollMode2();
    const hybridWpmCalMult = mode === "hybrid" ? getHybridWpmCalibrationMultiplier() : 1;
    const pxPerSec = basePxpsRaw * hybridWpmCalMult;
    logHybridTrace(
      "base_speed_compute",
      {
        speedRaw: targetWpm,
        unit: "wpm",
        mode,
        wpm: targetWpm,
        wpl,
        lineHeightPx: Number(lineHeightPx.toFixed(2)),
        basePxpsRaw: Number(basePxpsRaw.toFixed(2)),
        hybridWpmCalMult: Number(hybridWpmCalMult.toFixed(3)),
        basePxps: Number(pxPerSec.toFixed(2))
      },
      {
        throttleMs: 100,
        signature: `${mode}|${Number(targetWpm).toFixed(2)}|${Number(wpl).toFixed(2)}|${Number(lineHeightPx).toFixed(2)}|${Number(hybridWpmCalMult).toFixed(3)}|${Number(pxPerSec).toFixed(2)}`
      }
    );
    try {
      console.info(
        `[WPM_CONVERT] ${JSON.stringify({
          targetWpm,
          mode,
          fsPx,
          lhScale,
          lineHeightPx,
          wpl,
          basePxpsRaw,
          hybridWpmCalMult,
          pxPerSec
        })}`
      );
    } catch {
    }
    return pxPerSec;
  } catch {
    return 0;
  }
}
function clamp2(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function createPaceEngine() {
  let mode = "assist";
  let caps = {
    base: { minPxs: 8, maxPxs: 360 },
    final: { minPxs: 10, maxPxs: 220 },
    accelCap: 60,
    decayMs: 250
  };
  let sens = 1;
  let _catchup = "off";
  let target = 0;
  let baseTarget = 0;
  let lastUpdate = performance.now();
  let lastWpm;
  const DEAD_WPM = 8;
  const ALPHA = 0.3;
  const SPEAKING_PXS = 45;
  function mapWpmToPxPerSec(wpm, doc) {
    try {
      const cs = getComputedStyle(doc.documentElement);
      const fsPx = parseFloat(cs.getPropertyValue("--tp-font-size")) || DEFAULT_SCRIPT_FONT_PX;
      const lhScale = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
      const lineHeightPx = fsPx * lhScale;
      const wpl = parseFloat(localStorage.getItem("tp_wpl_hint") || "8") || 8;
      const linesPerSec = wpm / 60 / wpl;
      return linesPerSec * lineHeightPx;
    } catch {
      return wpm / 60 / 8 * (DEFAULT_SCRIPT_FONT_PX * 1.4);
    }
  }
  function setMode(m) {
    mode = m;
  }
  function setCaps(c) {
    const { base, final, minPxs, maxPxs, accelCap, decayMs } = c;
    if (base) {
      caps.base = { ...caps.base, ...base };
    }
    if (final) {
      caps.final = { ...caps.final, ...final };
    }
    if (typeof minPxs === "number") {
      caps.base.minPxs = minPxs;
      caps.final.minPxs = minPxs;
    }
    if (typeof maxPxs === "number") {
      caps.base.maxPxs = maxPxs;
      caps.final.maxPxs = maxPxs;
    }
    if (typeof accelCap === "number") caps.accelCap = accelCap;
    if (typeof decayMs === "number") caps.decayMs = decayMs;
  }
  function setSensitivity(mult) {
    sens = clamp2(mult, 0.5, 1.5);
  }
  function setCatchupBias(level) {
    _catchup = level;
  }
  function consume(tempo, speaking2) {
    const now2 = performance.now();
    const dt = Math.max(1e-3, (now2 - lastUpdate) / 1e3);
    lastUpdate = now2;
    if (mode === "vad") {
      const tgt = speaking2 ? SPEAKING_PXS : target * Math.pow(0.85, dt * (1e3 / caps.decayMs));
      const maxStep = caps.accelCap * dt;
      const next = target + clamp2(tgt - target, -maxStep, maxStep);
      const nextBase = clamp2(next, caps.base.minPxs, caps.base.maxPxs);
      baseTarget = nextBase;
      target = clamp2(baseTarget, caps.final.minPxs, caps.final.maxPxs);
      return;
    }
    let wpm = tempo.wpm;
    if ((wpm == null || !isFinite(wpm)) && speaking2) {
      const baseline = parseFloat(localStorage.getItem("tp_baseline_wpm") || "120") || 120;
      wpm = baseline;
    }
    if (wpm == null || !isFinite(wpm)) return;
    if (!(lastWpm != null && Math.abs(wpm - lastWpm) < DEAD_WPM)) {
      lastWpm = wpm;
      const pxsRaw = mapWpmToPxPerSec(wpm, document) * sens;
      const smoothed = target === 0 ? pxsRaw : ALPHA * pxsRaw + (1 - ALPHA) * target;
      const maxStep = caps.accelCap * dt;
      const next = target + clamp2(smoothed - target, -maxStep, maxStep);
      const nextBase = clamp2(next, caps.base.minPxs, caps.base.maxPxs);
      baseTarget = nextBase;
      target = clamp2(baseTarget, caps.final.minPxs, caps.final.maxPxs);
      logHybridPaceTelemetry({
        mode,
        wpm,
        pxsRaw: Number(pxsRaw.toFixed(2)),
        smoothed: Number(smoothed.toFixed(2)),
        baseTarget: Number(baseTarget.toFixed(2)),
        finalTarget: Number(target.toFixed(2)),
        baseCaps: { ...caps.base },
        finalCaps: { ...caps.final },
        accelCap: caps.accelCap
      });
    }
  }
  function getTargetPxs() {
    return clamp2(target, caps.final.minPxs, caps.final.maxPxs);
  }
  return { setMode, setCaps, setSensitivity, setCatchupBias, consume, getTargetPxs };
}
function createOrchestrator() {
  const synth = createFeatureSynth();
  const engine = createPaceEngine();
  const motor = createAutoMotor();
  let mode = "assist";
  let started = false;
  let adapter = null;
  let unsub = null;
  let asrErrUnsub = null;
  const errors = [];
  const ModeAliases = { wpm: "assist", asr: "assist", vad: "vad", align: "align", assist: "assist" };
  function setMode(m) {
    const norm = ModeAliases[m] || m;
    mode = norm;
    engine.setMode(mode);
  }
  function setGovernor(c) {
    engine.setCaps(c);
  }
  function setSensitivity(mult) {
    engine.setSensitivity(mult);
  }
  function setAlignStrategy(_s) {
  }
  function getStatus() {
    const tempo = synth.getTempo();
    return { mode, wpm: tempo.wpm, speaking: synth.getSpeaking(), targetPxs: engine.getTargetPxs(), errors: [...errors] };
  }
  async function start(a) {
    if (started) return;
    adapter = a;
    let restarts = 0;
    unsub = a.onFeature((f) => {
      try {
        synth.push(f);
        const tempo = synth.getTempo();
        const speaking2 = synth.getSpeaking();
        engine.consume(tempo, speaking2);
        const pxs = engine.getTargetPxs();
        try {
          motor.setVelocity(pxs);
        } catch {
        }
      } catch {
      }
    });
    await a.start();
    started = true;
    try {
      const onErr = () => {
        if (restarts++ === 0) {
          setTimeout(async () => {
            try {
              await adapter?.start();
              if (window.toast) window.toast("ASR restarted");
            } catch {
            }
          }, 300);
        } else {
          setMode("vad");
          try {
            if (window.toast) window.toast("ASR unstable \u2192 VAD fallback");
          } catch {
          }
        }
      };
      const h = onErr;
      window.addEventListener("tp:asr:error", h);
      asrErrUnsub = () => {
        try {
          window.removeEventListener("tp:asr:error", h);
        } catch {
        }
      };
    } catch {
    }
  }
  async function stop2() {
    try {
      unsub?.();
      unsub = null;
    } catch {
    }
    try {
      await adapter?.stop();
    } catch {
    }
    try {
      asrErrUnsub?.();
      asrErrUnsub = null;
    } catch {
    }
    adapter = null;
    started = false;
  }
  return { start, stop: stop2, setMode, setGovernor, setSensitivity, setAlignStrategy, getStatus };
}
var KEY2 = "tp_ui_prefs_v1";
var state2 = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY2) || "{}") || {};
    return { linkTypography: false, hybridGate: "db_or_vad", hybridUseProfileId: parsed.hybridUseProfileId || null, ...parsed };
  } catch {
    return { linkTypography: false, hybridGate: "db_or_vad", hybridUseProfileId: null };
  }
})();
var subs2 = /* @__PURE__ */ new Set();
var getUiPrefs = () => state2;
var onUiPrefs = (fn) => (subs2.add(fn), () => subs2.delete(fn));
var LS_KEY = "scrollMode";
var LEGACY_LS_KEYS = ["tp_scroll_mode_v1", "tp_scroll_mode"];
var DEFAULTS = {
  mode: "hybrid",
  step: { holdCreep: 8 },
  hybrid: { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 }
};
var state22 = { ...DEFAULTS };
var viewer = null;
function ensureViewerElement() {
  if (!viewer) {
    try {
      viewer = document.getElementById("viewer");
    } catch {
      viewer = null;
    }
  }
  return viewer;
}
function hasScrollableTarget() {
  const el = ensureViewerElement();
  if (!el) return false;
  try {
    return el.scrollHeight > el.clientHeight;
  } catch {
    return true;
  }
}
var scrollWriter = getScrollWriter();
try {
  const origScrollTo = scrollWriter?.scrollTo?.bind(scrollWriter);
  if (origScrollTo) {
    scrollWriter.scrollTo = (y, opts) => {
      scrollWrite(y, { from: "scrollWriter.scrollTo", reason: "hooked" });
      return origScrollTo(y, opts);
    };
  }
  const origScrollBy = scrollWriter?.scrollBy?.bind(scrollWriter);
  if (origScrollBy) {
    scrollWriter.scrollBy = (delta, opts) => {
      const target = (() => {
        try {
          const el = viewer ?? scrollerEl ?? (typeof document !== "undefined" ? document.getElementById("viewer") : null);
          if (!el) return null;
          return Math.max(0, el.scrollTop + delta);
        } catch {
          return null;
        }
      })();
      if (typeof target === "number") {
        scrollWrite(target, { from: "scrollWriter.scrollBy", reason: "hooked" });
      }
      return origScrollBy(delta, opts);
    };
  }
} catch (err) {
  try {
    console.warn("[SCROLL_WRITE] hook failed", err);
  } catch {
  }
}
function isCiAutoSmoke() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const flags = ["ci", "mockFolder", "uiMock", "noRelax"];
    for (const flag of flags) {
      if (params.get(flag) === "1") return true;
    }
    const hash = window.location.hash || "";
    if (hash.includes("ci=1") || hash.includes("mockFolder=1") || hash.includes("uiMock=1") || hash.includes("noRelax=1")) {
      return true;
    }
  } catch {
  }
  return false;
}
var smokeAutoMovementScheduled = false;
function scheduleCiAutoMovement() {
  if (!isCiAutoSmoke()) return;
  if (smokeAutoMovementScheduled) return;
  smokeAutoMovementScheduled = true;
  setTimeout(() => {
    smokeAutoMovementScheduled = false;
    try {
      scrollWriter.scrollBy?.(4, { behavior: "auto" });
    } catch {
    }
    try {
      const viewer2 = typeof document !== "undefined" ? document.getElementById("viewer") : null;
      if (viewer2) {
        const room = Math.max(0, (viewer2.scrollHeight || 0) - (viewer2.clientHeight || 0));
        if (room > 0) {
          const next = Math.min(room, (viewer2.scrollTop || 0) + 4);
          viewer2.scrollTop = next;
        }
      }
    } catch {
    }
  }, 150);
}
var hybridMotor = createHybridWpmMotor({
  getWriter: () => scrollWriter,
  getScrollTop: () => viewer ? viewer.scrollTop || 0 : 0,
  getMaxScrollTop: () => viewer ? Math.max(0, viewer.scrollHeight - viewer.clientHeight) : Number.POSITIVE_INFINITY,
  log: isDevMode2() ? logHybridMotorEvent : () => {
  }
});
try {
  window.__tpHybridMotor = hybridMotor;
} catch {
}
function refreshHybridWriter() {
  try {
    hybridMotor.setWriter(viewer ?? scrollerEl ?? null);
  } catch {
  }
}
var HYBRID_SILENCE_SOFT_MS = 3e3;
var HYBRID_PAUSE_SILENCE_SOFT_MS = 7500;
var HYBRID_SILENCE_HARD_STOP_MS = 25e3;
var LIVE_GRACE_MS = 1800;
var HYBRID_SPEECH_PRESENT_HOLD_MS = 1600;
var HYBRID_HARD_NOMATCH_OFFSCRIPT_GRACE_MS = 420;
var OFFSCRIPT_MILD = 0.75;
var OFFSCRIPT_DEEP = 0.55;
var RECOVERY_SCALE = 1;
var HYBRID_ON_SCRIPT_SIM = 0.32;
var HYBRID_OFFSCRIPT_MILD_SIM = 0.2;
var HYBRID_GRACE_DURATION_MS = 900;
var OFFSCRIPT_SCALE = 0.85;
var SILENCE_SCALE = 0.65;
var PAUSE_DRIFT_SCALE = 0.95;
var PAUSE_LOOKAHEAD_LINES = 10;
var HYBRID_PAUSE_TOKENS = ["[pause]", "[beat]", "[reflective pause]"];
var GRACE_MIN_SCALE = 0.9;
var HYBRID_BASELINE_FLOOR_PXPS = 24;
var HYBRID_WPM_CAL_MULT_DEFAULT = 2.5;
var HYBRID_WPM_CAL_MULT_MIN = 0.25;
var HYBRID_WPM_CAL_MULT_MAX = 8;
var HYBRID_ASSIST_CAP_FRAC = 0.35;
var HYBRID_EVENT_TTL_MIN = 20;
var HYBRID_EVENT_TTL_MAX = 2e3;
var HYBRID_BRAKE_DEFAULT_TTL = 320;
var HYBRID_ASSIST_DEFAULT_TTL = 320;
var HYBRID_ASSIST_MAX_BOOST = 420;
var OFFSCRIPT_EVIDENCE_THRESHOLD = 4;
var OFFSCRIPT_EVIDENCE_RESET_MS = 2200;
var OFFSCRIPT_DECAY_T1_MS = 2e3;
var OFFSCRIPT_DECAY_T2_MS = 6e3;
var OFFSCRIPT_DECAY_T3_MS = 1e4;
var OFFSCRIPT_DECAY_T4_MS = 12e3;
var OFFSCRIPT_DECAY_CRAWL = 0.1;
var HYBRID_OFFSCRIPT_SPEECH_FLOOR_MULT = 0.35;
var ON_SCRIPT_LOCK_HOLD_MS = 1500;
var PAUSE_ASSIST_TAIL_MS = 2e3;
var IGNORED_ASR_PURSUIT_LOG_THROTTLE_MS = 2e3;
var MANUAL_SCROLL_LOG_THROTTLE_MS = 1500;
var PROGRAMMATIC_WRITER_GRACE_MS = 250;
var PROGRAMMATIC_WRITER_LOG_THROTTLE_MS = 1e3;
var HYBRID_CTRL_LOG_THROTTLE_MS = 500;
var HYBRID_CTRL_CONF_MIN = 0.25;
var HYBRID_CTRL_ANCHOR_RECENCY_MS = 2500;
var HYBRID_CTRL_ENABLED = (() => {
  if (typeof window === "undefined") return false;
  let manualOverride = false;
  try {
    const current = window.location.href || window.location.hash || window.location.search || "";
    const url = new URL(current, window.location.origin || void 0);
    const fromSearch = url.searchParams.get("hybridCtrl");
    const fromHash = new URLSearchParams((url.hash || "").replace(/^#/, "")).get("hybridCtrl");
    if (fromSearch === "1" || fromHash === "1") manualOverride = true;
    if (window.__TP_HYBRID_CTRL === true) manualOverride = true;
  } catch {
    try {
      if (window.__TP_HYBRID_CTRL === true) manualOverride = true;
    } catch {
    }
  }
  if (manualOverride) return true;
  return state22.mode === "hybrid";
})();
try {
  if (typeof window !== "undefined") {
    console.info("[HYBRID_CTRL] flag", {
      href: window.location.href,
      enabled: HYBRID_CTRL_ENABLED
    });
  }
} catch {
}
var HYBRID_CTRL_KP = 0.22;
var HYBRID_CTRL_ASSIST_MAX = 1.25;
var HYBRID_CTRL_BRAKE_MIN = 0.65;
var HYBRID_CTRL_MIN_MULT = 0.9;
var HYBRID_CTRL_SILENCE_SHORT_MS = 700;
var HYBRID_CTRL_SILENCE_LONG_MS = 2e3;
var HYBRID_CTRL_SILENCE_SHORT_CAP = 0.75;
var HYBRID_CTRL_SILENCE_LONG_CAP = 0.6;
var HYBRID_CTRL_LINE_PX_DEFAULT = 56;
var HYBRID_CTRL_DRIFT_WEAK_PX = 160;
var HYBRID_CTRL_MIN_PXPS = 12;
var HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD = 0.45;
var HYBRID_CTRL_OFFSCRIPT_LINE_DELTA = 3;
var HYBRID_CTRL_OFFSCRIPT_PENALTY = 0.35;
var HYBRID_CTRL_LINE_ERROR_RANGE = 16;
var HYBRID_CTRL_LINE_CURVE_EXP = 1.6;
var HYBRID_CTRL_LINE_POS_MULT_DELTA = 0.9;
var HYBRID_CTRL_LINE_NEG_MULT_DELTA = 0.5;
var HYBRID_CTRL_LINE_MAX_MULT = 1.9;
var HYBRID_CTRL_LINE_MIN_MULT = 0.5;
var HYBRID_CTRL_LINE_SMOOTH_TAU_MS = 450;
var HYBRID_CTRL_LINE_RATE_LIMIT_PER_SEC = 0.8;
var HYBRID_CTRL_LINE_RATE_LIMIT_BEHIND_MULT = 4;
var HYBRID_ON_TARGET_PX = 32;
var HYBRID_CTRL_ON_TARGET_STABLE_PX = 12;
var HYBRID_CTRL_ON_TARGET_MULT_MIN = 0.98;
var HYBRID_CTRL_ON_TARGET_MULT_MAX = 1.05;
var HYBRID_CTRL_ON_TARGET_VELOCITY_EPS = 12;
var HYBRID_CTRL_MODE_DEADBAND_LINES = 3;
var HYBRID_CTRL_BASE_MAX_MULT = 2.8;
var HYBRID_CTRL_AGGRO_MAX_MULT = 3.2;
var HYBRID_CTRL_DYNAMIC_MAX_MULT = 6;
var HYBRID_CTRL_DYNAMIC_MAX_MULT_AGGRO = 8;
var HYBRID_CTRL_DYNAMIC_MAX_ABS_MIN_PXPS = 240;
var HYBRID_CTRL_DYNAMIC_MAX_ABS_MIN_PXPS_AGGRO = 300;
var HYBRID_CTRL_CTRL_MULT_MAX = 2.5;
var HYBRID_CTRL_REACTIVE_MULT_MAX = 7;
var HYBRID_CTRL_POLICY_MULT_MIN = 0.35;
var HYBRID_CTRL_POLICY_MULT_MAX = 1.25;
var HYBRID_CTRL_PRECLAMP_SCALE_MAX = 8;
var HYBRID_REACTIVE_BEHIND_BASE = 0.55;
var HYBRID_REACTIVE_BEHIND_ACC_THRESHOLD = 2;
var HYBRID_REACTIVE_BEHIND_ACC_BONUS = 0.25;
var HYBRID_CTRL_ASSIST_BEHIND_BOOST_FRAC = 0.15;
var HYBRID_ON_TARGET_LINES = 0.92;
var HYBRID_MULT_DEBUG_THROTTLE_MS = 500;
var HYBRID_POLICY_LOG_THROTTLE_MS = 700;
var HYBRID_ONSCRIPT_SIM_MIN = 0.74;
var HYBRID_CTRL_PARAM_ENABLED = (() => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("hybridCtrl") === "1";
  } catch {
    return false;
  }
})();
var HYBRID_CTRL_DEV_OVERRIDE_PHASES_MS = [3e3, 6e3, 1e4];
var HYBRID_CTRL_DEV_OVERRIDE_MULTS = [1.4, 0.7, 1];
var HYBRID_CTRL_DEV_OVERRIDE_DURATION_MS = 1e4;
var hybridCtrlDevOverrideStart = null;
var hybridCtrlDevOverrideDone = false;
var lastHybridMultDebugAt = 0;
function getHybridCtrlDevOverride(now2) {
  if (!HYBRID_CTRL_ENABLED || !HYBRID_CTRL_PARAM_ENABLED || hybridCtrlDevOverrideDone || typeof window === "undefined") {
    return null;
  }
  if (hybridCtrlDevOverrideStart === null) {
    hybridCtrlDevOverrideStart = now2;
  }
  const elapsed = Math.max(0, now2 - hybridCtrlDevOverrideStart);
  if (elapsed >= HYBRID_CTRL_DEV_OVERRIDE_DURATION_MS) {
    hybridCtrlDevOverrideDone = true;
    return null;
  }
  for (let i = 0; i < HYBRID_CTRL_DEV_OVERRIDE_PHASES_MS.length; i += 1) {
    if (elapsed < HYBRID_CTRL_DEV_OVERRIDE_PHASES_MS[i]) {
      return HYBRID_CTRL_DEV_OVERRIDE_MULTS[i];
    }
  }
  return null;
}
var lastHybridGateFingerprint = null;
var lastAsrMatch = { currentIndex: -1, bestIndex: -1, bestSim: NaN };
var hybridLastMatch = null;
var hybridMatchSeen = false;
var hybridLastNoMatch = null;
var hybridMatcherSource = "unknown";
var hybridMatcherSourceDetail = "unknown";
var lastHybridMatcherProbeAt = 0;
var HYBRID_HARD_NOMATCH_SIM_MIN = 0.25;
var HYBRID_MATCHER_PROBE_THROTTLE_MS = 350;
var HYBRID_BLOCKS_NOT_READY_HOLD_MS = 3500;
function isHybridBackendReady() {
  try {
    if (window.__tpSpeechOrchestrator?.start) return true;
  } catch {
  }
  try {
    if (window.__tpSpeech?.startRecognizer) return true;
  } catch {
  }
  try {
    if (window.__tpSpeechCanDynImport === true) return true;
  } catch {
  }
  try {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) return true;
  } catch {
  }
  return false;
}
function computeAsrBlockScriptSig(meta2) {
  if (!meta2 || !Array.isArray(meta2.units) || !meta2.units.length) return null;
  try {
    const units = meta2.units;
    const first = units[0];
    const last = units[units.length - 1];
    const sums = units.reduce(
      (acc, unit) => {
        const chars = Number(unit?.charCount);
        const sentences = Number(unit?.sentenceCount);
        if (Number.isFinite(chars)) acc.chars += Math.max(0, Math.floor(chars));
        if (Number.isFinite(sentences)) acc.sentences += Math.max(0, Math.floor(sentences));
        return acc;
      },
      { chars: 0, sentences: 0 }
    );
    return [
      units.length,
      Number(first?.unitStart ?? -1),
      Number(first?.unitEnd ?? -1),
      Number(last?.unitStart ?? -1),
      Number(last?.unitEnd ?? -1),
      sums.sentences,
      sums.chars
    ].join(":");
  } catch {
    return null;
  }
}
function readHybridScriptHash() {
  try {
    const hash = String(window.__TP_LAST_APPLIED_HASH || "").trim();
    return hash || null;
  } catch {
    return null;
  }
}
function getHybridBlockRuntimeState() {
  const blockEls2 = getAsrBlockElements();
  const meta2 = getAsrBlockIndex();
  const storeCount = Array.isArray(blockEls2) ? blockEls2.length : 0;
  let globalCount = 0;
  let globalReady = false;
  try {
    const rawCount = Number(window.__tpAsrBlockCount);
    globalCount = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
    globalReady = Boolean(window.__tpAsrBlocksReady);
  } catch {
  }
  const blockCount = Math.max(storeCount, globalCount);
  const blocksReady = (globalReady || storeCount > 0) && blockCount > 0;
  const scriptSig = computeAsrBlockScriptSig(meta2);
  return {
    blocksReady,
    blockCount,
    blockSource: String(meta2?.source || "unknown"),
    schemaVersion: Number.isFinite(Number(meta2?.schemaVersion)) ? Number(meta2?.schemaVersion) : null,
    scriptSig,
    scriptHash: readHybridScriptHash(),
    backendReady: isHybridBackendReady(),
    matcherSource: hybridMatcherSource,
    matcherSourceDetail: hybridMatcherSourceDetail
  };
}
function isHybridBlocksNotReadyHold(now2 = nowMs(), runtime = getHybridBlockRuntimeState()) {
  if (!runtime.backendReady || runtime.blocksReady) return false;
  const lastSpeechAgeMs = Math.max(0, now2 - hybridSilence.lastSpeechAtMs);
  return isHybridSpeechPresent(now2) || lastSpeechAgeMs <= HYBRID_BLOCKS_NOT_READY_HOLD_MS;
}
function logHybridMatcherProbe(reason, payload) {
  if (!isDevMode2()) return;
  const now2 = nowMs();
  if (now2 - lastHybridMatcherProbeAt < HYBRID_MATCHER_PROBE_THROTTLE_MS) return;
  lastHybridMatcherProbeAt = now2;
  try {
    console.info("[HYBRID_MATCHER_PROBE]", { reason, ...payload });
  } catch {
  }
}
function getHybridMatchState() {
  const matchSim = hybridMatchSeen && Number.isFinite(hybridLastMatch?.bestSim ?? NaN) ? hybridLastMatch.bestSim : Number.isFinite(lastAsrMatch?.bestSim ?? NaN) ? lastAsrMatch.bestSim : null;
  const simFinite = Number.isFinite(matchSim ?? NaN);
  const simValue = simFinite ? matchSim : null;
  const sawNoMatch = hybridLastNoMatch === true;
  const hardNoMatch = sawNoMatch && (!simFinite || simValue != null && simValue < HYBRID_HARD_NOMATCH_SIM_MIN);
  const weakMatch = hybridMatchSeen && !hardNoMatch && (!simFinite || simValue != null && simValue < HYBRID_ONSCRIPT_SIM_MIN);
  return {
    bestSim: simValue,
    sawNoMatch,
    weakMatch,
    hardNoMatch
  };
}
function isHybridDriftWeak(errorInfo) {
  if (!errorInfo) return false;
  const deltaPx = Number.isFinite(errorInfo.errorPx ?? NaN) && errorInfo.errorPx != null ? errorInfo.errorPx : null;
  if (deltaPx == null) return false;
  const sameLineByHint = Number.isFinite(errorInfo.bestIdx ?? NaN) && Number.isFinite(errorInfo.markerIdx ?? NaN) && errorInfo.bestIdx === errorInfo.markerIdx;
  const bestIdx = Number.isFinite(lastAsrMatch.bestIndex ?? NaN) && lastAsrMatch.bestIndex >= 0 ? lastAsrMatch.bestIndex : null;
  const currentIdx = Number.isFinite(lastAsrMatch.currentIndex ?? NaN) && lastAsrMatch.currentIndex >= 0 ? lastAsrMatch.currentIndex : null;
  const sameLineByMatch = bestIdx != null && currentIdx != null && bestIdx === currentIdx;
  if (!sameLineByHint && !sameLineByMatch) return false;
  return Math.abs(deltaPx) >= HYBRID_CTRL_DRIFT_WEAK_PX;
}
var hybridBasePxps = 0;
var hybridScale = RECOVERY_SCALE;
var hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
var hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
var pauseAssistTailBoost = 0;
var pauseAssistTailUntil = 0;
var lastIgnoredAsrPursuitLogAt = 0;
var hybridVelocityRefreshRaf = null;
var hybridTargetHintState = null;
var speechActive = false;
var hybridCommitBoostUntilMs = 0;
function armHybridCommitBoostWindow(reason) {
  if (reason !== "asr-commit") return;
  const durMs = isHybridAggroEnabled() ? 1750 : 750;
  const until = nowMs() + durMs;
  if (until > hybridCommitBoostUntilMs) hybridCommitBoostUntilMs = until;
}
function isHybridCommitBoostActive() {
  return nowMs() < hybridCommitBoostUntilMs;
}
var hybridLastGoodTargetTop = null;
var hybridWantedRunning = false;
var liveGraceWindowEndsAt = null;
var lastManualScrollBrakeLogAt = 0;
var lastProgrammaticWriterStamp = null;
var lastProgrammaticWriterLogAt = 0;
var lastHybridCtrlLogAt = 0;
var hybridCtrl = {
  mult: 1,
  lastTs: 0,
  lastErrorPx: 0,
  lastAnchorTs: 0,
  engagedLogged: false,
  lineMult: 1,
  lineTargetMult: 1,
  lineSource: "none"
};
var hybridSessionPhase = "idle";
function getHybridSessionPhase() {
  return hybridSessionPhase;
}
function isPauseTokenText(text) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return HYBRID_PAUSE_TOKENS.some((token) => normalized.includes(token));
}
function getAsrParaText(entry) {
  if (!entry) return "";
  const candidates = [
    typeof entry.key === "string" ? entry.key : void 0,
    typeof entry.text === "string" ? entry.text : void 0,
    typeof entry.lineText === "string" ? entry.lineText : void 0,
    typeof entry.paragraph === "string" ? entry.paragraph : void 0,
    typeof entry.raw === "string" ? entry.raw : void 0,
    typeof entry.html === "string" ? entry.html : void 0,
    entry?.el?.textContent
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}
function isPlannedPauseLikely() {
  if (typeof window === "undefined") return false;
  const rawParaIndex = Array.isArray(window.paraIndex) ? window.paraIndex : [];
  if (!rawParaIndex.length) return false;
  const bestIdx = Number.isFinite(lastAsrMatch.bestIndex) && lastAsrMatch.bestIndex >= 0 ? Math.floor(lastAsrMatch.bestIndex) : -1;
  const currentIdx = Number.isFinite(lastAsrMatch.currentIndex) && lastAsrMatch.currentIndex >= 0 ? Math.floor(lastAsrMatch.currentIndex) : -1;
  let baseIndex = bestIdx >= 0 ? bestIdx : currentIdx;
  if (baseIndex < 0) {
    const fallbackRaw = typeof window.currentIndex === "number" ? window.currentIndex : -1;
    baseIndex = Number.isFinite(fallbackRaw) && fallbackRaw >= 0 ? Math.floor(fallbackRaw) : -1;
  }
  if (baseIndex < 0) return false;
  const lookahead = Math.max(1, PAUSE_LOOKAHEAD_LINES);
  const start = Math.max(0, Math.min(rawParaIndex.length - 1, baseIndex));
  const end = Math.min(rawParaIndex.length - 1, start + lookahead);
  for (let idx = start; idx <= end; idx++) {
    const entry = rawParaIndex[idx];
    const paragraphText = getAsrParaText(entry);
    if (isPauseTokenText(paragraphText)) {
      return true;
    }
  }
  return false;
}
function computeHybridSilenceDelayMs() {
  return isPlannedPauseLikely() ? HYBRID_PAUSE_SILENCE_SOFT_MS : HYBRID_SILENCE_SOFT_MS;
}
function getTranscriptText(detail) {
  const fromField = detail?.transcript ?? detail?.text ?? detail?.transcriptText;
  if (typeof fromField === "string" && fromField.trim()) return fromField.trim();
  if (Array.isArray(detail?.nBest) && detail.nBest.length > 0) {
    const first = detail.nBest[0];
    if (typeof first?.transcript === "string" && first.transcript.trim()) {
      return first.transcript.trim();
    }
  }
  if (detail?.bestTranscript) {
    const v = String(detail.bestTranscript).trim();
    if (v) return v;
  }
  if (detail?.result) {
    const candidate = detail.result.transcript ?? detail.result.text;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}
function isWeakNoMatch(detail) {
  if (!detail) return true;
  const transcript = getTranscriptText(detail);
  if (!transcript) return true;
  const words = transcript.split(/\s+/).filter(Boolean).length;
  return words < 3 || transcript.length < 12;
}
var sliderTouchedThisSession = false;
var offScriptEvidence = 0;
var lastOffScriptEvidenceTs = 0;
function scheduleHybridVelocityRefresh() {
  if (!shouldHybridRefresh()) {
    stopHybridVelocityRefresh();
    return;
  }
  if (hybridVelocityRefreshRaf != null) return;
  if (typeof window === "undefined") return;
  hybridVelocityRefreshRaf = window.requestAnimationFrame(() => {
    hybridVelocityRefreshRaf = null;
    if (getScrollMode2() !== "hybrid") return;
    const now2 = nowMs();
    if (!shouldHybridRefresh(now2)) {
      stopHybridVelocityRefresh();
      return;
    }
    try {
      runHybridVelocity(hybridSilence);
    } catch (err) {
      if (isDevMode2()) {
        try {
          console.warn("[HYBRID] velocity refresh failed", err);
        } catch {
        }
      }
    }
  });
}
function cancelHybridVelocityRefresh() {
  if (hybridVelocityRefreshRaf != null && typeof window !== "undefined") {
    try {
      window.cancelAnimationFrame(hybridVelocityRefreshRaf);
    } catch {
    }
  }
  hybridVelocityRefreshRaf = null;
  hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
  hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
  hybridTargetHintState = null;
}
function stopHybridVelocityRefresh() {
  if (hybridVelocityRefreshRaf != null && typeof window !== "undefined") {
    try {
      window.cancelAnimationFrame(hybridVelocityRefreshRaf);
    } catch {
    }
  }
  hybridVelocityRefreshRaf = null;
}
function shouldHybridRefresh(now2 = nowMs()) {
  const mode = getScrollMode2();
  if (mode !== "hybrid") {
    if (state22.mode !== mode) state22.mode = mode;
    return false;
  }
  if (state22.mode !== "hybrid") state22.mode = "hybrid";
  if (hybridMotor.isRunning()) return true;
  if (isHybridGraceActive(now2)) return true;
  const brakeActive = hybridBrakeState.expiresAt > now2;
  if (brakeActive) return true;
  if (hybridAssistState.expiresAt > now2) return true;
  if (hybridTargetHintState != null) return true;
  return false;
}
var offScriptStreak = 0;
var onScriptStreak = 0;
var lastGoodMatchAtMs = 0;
var hybridGraceUntil = 0;
var WPM_USER_DEDUPE_MS = 600;
var lastUserWpmPx = 0;
var lastUserWpmAt = 0;
var WPM_USER_SOURCES = /* @__PURE__ */ new Set(["slider-change", "slider-input", "sidebar"]);
var liveSessionWpmLocked = false;
var wpmSliderUserTouched = false;
var suppressWpmUiEcho = false;
var lastWpmIntent = null;
var userWpmLocked = false;
function setHybridBrake(factor, ttlMs, reason = null) {
  const safeFactor = Number.isFinite(factor) ? clamp2(factor, 0, 1) : 1;
  const rawTtl = Number.isFinite(ttlMs) ? ttlMs : 0;
  const ttl = Math.max(0, Math.min(HYBRID_EVENT_TTL_MAX, rawTtl));
  const now2 = nowMs();
  const expiresAt = ttl > 0 ? now2 + ttl : 0;
  hybridBrakeState = {
    factor: safeFactor,
    expiresAt,
    reason
  };
  scheduleHybridVelocityRefresh();
  runHybridVelocity(hybridSilence);
  if (isDevMode2()) {
    let shouldLogBrake = true;
    if (reason === "manual-scroll") {
      const elapsed = now2 - lastManualScrollBrakeLogAt;
      if (elapsed < MANUAL_SCROLL_LOG_THROTTLE_MS) {
        shouldLogBrake = false;
      } else {
        lastManualScrollBrakeLogAt = now2;
      }
    }
    if (shouldLogBrake) {
      try {
        const brakeTag = state22.mode === "asr" ? "ASR_BRAKE" : "HYBRID_BRAKE";
        console.info(`[${brakeTag}] set`, {
          factor: safeFactor,
          ttl,
          expiresAt: hybridBrakeState.expiresAt,
          reason: hybridBrakeState.reason
        });
      } catch {
      }
    }
  }
}
function recordUserWpmPx(pxs) {
  lastUserWpmPx = pxs > 0 ? pxs : 0;
  lastUserWpmAt = nowMs();
}
function markSliderInteraction() {
  wpmSliderUserTouched = true;
}
function noteWpmIntent(wpm, source) {
  lastWpmIntent = { wpm, source, at: nowMs() };
  if (!userWpmLocked && source === "sidebar") {
    userWpmLocked = true;
    try {
      console.info("[WPM_INTENT] userWpmLocked=1 (first touch)", { wpm, source });
    } catch {
    }
  }
}
function scheduleWpmUiEventReset() {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => {
      suppressWpmUiEcho = false;
    });
  } else {
    setTimeout(() => {
      suppressWpmUiEcho = false;
    }, 0);
  }
}
function setSliderValueSilently(el, value) {
  suppressWpmUiEcho = true;
  el.value = value;
  scheduleWpmUiEventReset();
}
function isSliderWpmSource(source) {
  return typeof source === "string" && WPM_USER_SOURCES.has(source);
}
function startHybridGrace(reason) {
  const now2 = nowMs();
  setHybridBrake(1, 0, reason ?? "grace-reset");
  hybridGraceUntil = now2 + HYBRID_GRACE_DURATION_MS;
  hybridSilence.pausedBySilence = false;
  hybridSilence.lastSpeechAtMs = now2;
  hybridSilence.offScriptActive = false;
  resetOffScriptDuration();
  const timeoutId = hybridSilence.timeoutId;
  if (timeoutId != null) {
    try {
      window.clearTimeout(timeoutId);
    } catch {
    }
    hybridSilence.timeoutId = null;
  }
  if (hybridWantedRunning) {
    const delay = Math.max(1, HYBRID_GRACE_DURATION_MS);
    const handler = window.__tp_handleHybridSilenceTimeout;
    if (typeof handler === "function") {
      hybridSilence.timeoutId = window.setTimeout(() => handler(), delay);
    } else {
      hybridSilence.timeoutId = window.setTimeout(() => handleHybridSilenceTimeout(), delay);
    }
  }
  if (isDevMode2()) {
    try {
      console.info("[HYBRID] grace window", { reason, until: hybridGraceUntil });
    } catch {
    }
  }
}
function isHybridGraceActive(now2 = nowMs()) {
  return hybridGraceUntil > now2;
}
var isHybridBypass = () => {
  try {
    return localStorage.getItem("tp_hybrid_bypass") === "1";
  } catch {
    return false;
  }
};
function persistMode() {
  try {
    localStorage.setItem(LS_KEY, state22.mode);
    LEGACY_LS_KEYS.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
      }
    });
  } catch {
  }
  try {
    window.addEventListener("pagehide", () => {
      try {
        flushProfilePersister();
      } catch {
      }
    });
  } catch {
  }
  try {
    document.addEventListener("visibilitychange", () => {
      try {
        if (document.visibilityState === "hidden") {
          flushProfilePersister();
        }
      } catch {
      }
    });
  } catch {
  }
}
function restoreMode() {
  try {
    const legacy = LEGACY_LS_KEYS.map((k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    }).find(Boolean);
    const m = localStorage.getItem(LS_KEY) || legacy;
    if (m) {
      const normalized = normalizeScrollModeValue(m) || m;
      state22.mode = normalized;
      try {
        localStorage.setItem(LS_KEY, normalized);
        LEGACY_LS_KEYS.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {
          }
        });
      } catch {
      }
    }
  } catch {
  }
}
function findNextLine(offsetTop, dir) {
  if (!viewer) return null;
  const lines = viewer.querySelectorAll(".line");
  if (!lines || !lines.length) return null;
  const y = Number.isFinite(offsetTop) ? offsetTop : viewer.scrollTop;
  if (dir > 0) {
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.offsetTop > y + 2) return el;
    }
    return lines[lines.length - 1];
  } else {
    let prev = lines[0];
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.offsetTop >= y - 2) return prev;
      prev = el;
    }
    return prev;
  }
}
function stepOnce(dir) {
  if (!viewer) viewer = document.getElementById("viewer");
  if (!viewer) return;
  const next = findNextLine(viewer.scrollTop, dir);
  if (!next) return;
  const target = Math.max(0, next.offsetTop - 6);
  try {
    scrollWriter.scrollTo(target, { behavior: "auto" });
  } catch {
  }
}
var creepRaf = 0;
var creepLast = 0;
var enabledNow = false;
var activeMotorBrain = null;
function setActiveMotor(brain, _mode) {
  activeMotorBrain = brain;
}
function clearActiveMotor(brain) {
  if (!brain || activeMotorBrain === brain) {
    activeMotorBrain = null;
  }
}
function holdCreepStart(pxPerSec = DEFAULTS.step.holdCreep, dir = 1) {
  if (!viewer) viewer = document.getElementById("viewer");
  if (!viewer) return;
  cancelAnimationFrame(creepRaf);
  creepLast = performance.now();
  const tick = (now2) => {
    const dt = (now2 - creepLast) / 1e3;
    creepLast = now2;
    try {
      scrollWriter.scrollBy(dir * pxPerSec * dt, { behavior: "auto" });
    } catch {
    }
    creepRaf = requestAnimationFrame(tick);
  };
  creepRaf = requestAnimationFrame(tick);
}
function holdCreepStop() {
  cancelAnimationFrame(creepRaf);
  creepRaf = 0;
}
var speaking = false;
var gateTimer;
function stopAutoMotor(reason) {
  const wasRunning = !!enabledNow || (typeof auto?.isRunning === "function" ? !!auto.isRunning() : false);
  if (wasRunning) {
    try {
      auto.setEnabled?.(false);
      auto.stop?.();
    } catch {
    }
    enabledNow = false;
    clearActiveMotor("auto");
    try {
      emitMotorState("auto", false);
    } catch {
    }
    if (isDevMode2() && reason) {
      try {
        console.info("[AUTO] forced stop", { reason });
      } catch {
      }
    }
    return true;
  }
  enabledNow = false;
  clearActiveMotor("auto");
  return false;
}
function stopHybridMotor(reason) {
  try {
    const wasHybridRunning = hybridMotor.isRunning();
    hybridMotor.stop();
    cancelHybridVelocityRefresh();
    hybridGraceUntil = 0;
    hybridSilence.pausedBySilence = false;
    hybridSilence.offScriptActive = false;
    resetOffScriptDuration();
    hybridSilence.lastSpeechAtMs = nowMs();
    pauseAssistTailBoost = 0;
    pauseAssistTailUntil = 0;
    clearHybridSilenceTimer();
    if (wasHybridRunning) {
      clearActiveMotor("hybrid");
      emitMotorState("hybridWpm", false);
      try {
        if (reason) console.debug("[HYBRID] forced stop", { reason });
      } catch {
      }
    }
  } catch (err) {
    if (isDevMode2()) {
      try {
        console.warn("[HYBRID] stop failed", { reason, err });
      } catch {
      }
    }
  }
}
function stopAllMotors(reason) {
  try {
    if (reason) {
      try {
        console.debug("[ScrollRouter] stopAllMotors", reason);
      } catch {
      }
    }
  } catch {
  }
  stopAutoMotor(reason);
  stopHybridMotor(reason);
}
function stopAllMotorsExcept(mode, reason) {
  stopAllMotors(reason);
}
function assertHybridStoppedIfNotHybrid(reason) {
  if (state22.mode === "hybrid") return;
  if (!hybridMotor.isRunning()) return;
  try {
    console.error("[HYBRID_ASSERT] motor running outside hybrid mode", {
      reason,
      mode: state22.mode
    });
  } catch {
  }
  stopHybridMotor(`assert:${reason}`);
}
function setSpeaking(on, auto2) {
  if (on === speaking) return;
  speaking = on;
  if (typeof auto2.setEnabled === "function") auto2.setEnabled(on);
  else auto2.toggle();
}
function hybridHandleDb(db, auto2) {
  if (state22.mode === "hybrid") return;
  const { attackMs, releaseMs, thresholdDb } = DEFAULTS.hybrid;
  if (gateTimer) clearTimeout(gateTimer);
  if (db >= thresholdDb) gateTimer = setTimeout(() => setSpeaking(true, auto2), attackMs);
  else gateTimer = setTimeout(() => setSpeaking(false, auto2), releaseMs);
}
function applyMode(m) {
  const normalized = normalizeScrollModeValue(m) || m;
  try {
    try {
      console.debug("[ScrollRouter] stopAllMotors", `mode switch to ${normalized}`);
    } catch {
    }
  } catch {
  }
  stopAllMotorsExcept(normalized, `mode switch to ${normalized}`);
  if (normalized !== "auto") {
    persistStoredAutoEnabled(false);
  }
  state22.mode = normalized;
  if (normalized === "asr") {
    stopAutoMotor("enter-asr");
    try {
      window.__tpScrollWriteActive = false;
    } catch {
    }
    resetAsrIntentState("mode-enter");
    try {
      const phase = String(appStoreSingleton.get?.("session.phase") || "");
      if (phase === "live") {
        asrIntentLiveSince = Date.now();
      } else {
        asrIntentLiveSince = 0;
      }
    } catch {
    }
  } else {
    asrIntentLiveSince = 0;
    resetAsrIntentState("mode-exit");
  }
  assertHybridStoppedIfNotHybrid("mode-change");
  persistMode();
  viewer = document.getElementById("viewer");
  refreshHybridWriter();
  try {
    const autoRow = document.querySelector(".row:has(#autoSpeed)");
    const wpmRow = document.getElementById("wpmRow");
    const speedLabel = document.querySelector("[data-scroll-speed-label]");
    const speedHint = document.querySelector("[data-scroll-speed-hint]");
    const speedInput = document.getElementById("autoSpeed");
    const modeExplain = document.querySelector("[data-scroll-mode-explain]");
    const isWpmLike = normalized === "wpm" || normalized === "hybrid";
    if (isWpmLike) {
      if (wpmRow) {
        wpmRow.classList.remove("visually-hidden");
        wpmRow.removeAttribute("aria-hidden");
      }
      if (autoRow) {
        autoRow.classList.add("visually-hidden");
        autoRow.setAttribute("aria-hidden", "true");
      }
      if (normalized === "wpm") {
        if (speedLabel) speedLabel.textContent = "Target speed (WPM)";
        if (speedHint) speedHint.textContent = "Scroll speed is driven purely by this WPM value.";
      } else {
        if (speedLabel) speedLabel.textContent = "Baseline speed (WPM)";
        if (speedHint) speedHint.textContent = "Hybrid: uses this WPM as a floor while ASR can pull the text ahead as you speak.";
      }
      if (speedInput) {
        speedInput.disabled = false;
        speedInput.dataset.mode = normalized;
      }
    } else {
      if (wpmRow) {
        wpmRow.classList.add("visually-hidden");
        wpmRow.setAttribute("aria-hidden", "true");
      }
      if (autoRow) {
        autoRow.classList.remove("visually-hidden");
        autoRow.removeAttribute("aria-hidden");
      }
      if (normalized === "asr") {
        if (speedLabel) speedLabel.textContent = "Scroll speed";
        if (speedHint) speedHint.textContent = "ASR-only: scroll position is driven by your voice; speed slider is ignored.";
        if (speedInput) {
          speedInput.disabled = true;
          speedInput.dataset.mode = "asr";
        }
      } else {
        if (speedLabel) speedLabel.textContent = "Scroll speed";
        if (speedHint) speedHint.textContent = "";
        if (speedInput) {
          speedInput.disabled = false;
          speedInput.dataset.mode = normalized;
        }
      }
    }
    if (modeExplain) {
      switch (normalized) {
        case "wpm":
          modeExplain.textContent = "WPM: scrolls at a fixed words-per-minute target; good for solo reads.";
          break;
        case "hybrid":
          modeExplain.textContent = "Hybrid: PLL between your voice and the WPM baseline; ASR nudges while the baseline keeps moving.";
          break;
        case "asr":
          modeExplain.textContent = "ASR: pure voice-locked mode - scroll position follows recognized speech; speed slider is ignored.";
          break;
        case "timed":
          modeExplain.textContent = "Timed: scrolls to hit your end time; useful for fixed-slot rehearsals.";
          break;
        default:
          modeExplain.textContent = "";
          break;
      }
    }
  } catch {
  }
}
function installScrollRouter(opts) {
  const { auto: autoMotor, viewer: viewerInstallFlag = false, hostEl = null } = opts;
  auto = autoMotor || auto || null;
  const canonicalScroller = getScrollerEl(viewerRole) || getScrollerEl("main");
  const docViewer = document.getElementById("viewer");
  if (!viewer) {
    if (docViewer) {
      viewer = docViewer;
    } else if (hostEl instanceof HTMLElement && hostEl.id === "viewer") {
      viewer = hostEl;
    }
  }
  if (hostEl instanceof HTMLElement) {
    scrollerEl = canonicalScroller || docViewer || viewer || hostEl;
  }
  if (!scrollerEl) {
    scrollerEl = canonicalScroller || docViewer || document.querySelector("main#viewer.viewer, #viewer") || document.querySelector("#script") || (viewerRole === "display" ? document.getElementById("wrap") : null);
  }
  if (!hybridScrollGraceListenerInstalled) {
    try {
      const scrollHandler = (event) => {
        if (!event.isTrusted) return;
        if (state22.mode === "hybrid" && isHybridProgrammaticScroll()) {
          return;
        }
        const target = event.target;
        const scroller = scrollerEl;
        if (!scroller || !target) return;
        if (scroller === target || scroller.contains(target)) {
          const now2 = nowMs();
          const writerStamp = getRecentProgrammaticWriterStamp(scroller, now2);
          if (writerStamp && (writerStamp.kind === "asr" || writerStamp.kind === "writer")) {
            if (isDevMode2() && now2 - lastProgrammaticWriterLogAt >= PROGRAMMATIC_WRITER_LOG_THROTTLE_MS) {
              lastProgrammaticWriterLogAt = now2;
              try {
                const brakeTag = state22.mode === "asr" ? "ASR_BRAKE" : "HYBRID_BRAKE";
                console.info(`[${brakeTag}] skip`, {
                  reason: "programmatic-writer",
                  source: writerStamp.source,
                  kind: writerStamp.kind,
                  ageMs: Math.max(0, Math.round(now2 - writerStamp.at)),
                  mode: state22.mode
                });
              } catch {
              }
            }
            return;
          }
          setHybridBrake(1, 0, "manual-scroll");
        }
      };
      window.addEventListener("scroll", scrollHandler, { capture: true, passive: true });
      hybridScrollGraceListenerInstalled = true;
    } catch {
    }
  }
  refreshHybridWriter();
  function setProcessorAndFlush() {
    autoIntentProcessor = (detail) => {
      try {
        processAutoIntent(detail);
      } catch (err) {
        console.error("[AUTO_INTENT] PROCESS crash", err);
        throw err;
      }
    };
    console.warn("[AUTO_INTENT] processor assigned", { hasPending: !!pendingAutoIntentDetail });
    if (pendingAutoIntentDetail) {
      console.warn("[AUTO_INTENT] flushing pending", pendingAutoIntentDetail);
      try {
        autoIntentProcessor(pendingAutoIntentDetail);
      } catch {
      }
      pendingAutoIntentDetail = null;
    }
  }
  setProcessorAndFlush();
  try {
    console.warn("[SCROLL_ROUTER] installScrollRouter ENTER", {
      viewerInstance: viewerInstallFlag,
      viewerEl: !!viewer,
      hostEl: hostEl ? hostEl.id || hostEl.className || hostEl.tagName : null,
      mode: state22.mode,
      autoIntentProcessorExists: !!autoIntentProcessor
    });
  } catch {
  }
  try {
    window.__tpScrollRouterTsActive = true;
  } catch {
  }
  restoreMode();
  try {
    const store2 = (typeof window !== "undefined" ? window.__tpStore : null) || appStoreSingleton;
    const storeMode = normalizeScrollModeValue(store2?.get?.("scrollMode"));
    if (storeMode && storeMode !== state22.mode) {
      state22.mode = storeMode;
    }
  } catch {
  }
  applyMode(state22.mode);
  emitScrollModeSnapshot("mode-change");
  try {
    const store2 = (typeof window !== "undefined" ? window.__tpStore : null) || appStoreSingleton;
    store2?.subscribe?.("scrollMode", (next) => {
      const normalized = normalizeScrollModeValue(next);
      if (!normalized || normalized === state22.mode) return;
      applyMode(normalized);
      if (normalized === "asr") {
        try {
          stopAllMotors("mode switch to asr (safety)");
        } catch {
        }
        try {
          window.dispatchEvent(new CustomEvent("tp:auto:intent", {
            detail: { enabled: false, reason: "mode-enter-asr" }
          }));
        } catch {
        }
      }
      emitScrollModeSnapshot("store-change");
    });
  } catch {
  }
  if (state22.mode === "hybrid" || state22.mode === "wpm") {
    seedHybridBaseSpeed2();
  }
  const orch = createOrchestrator();
  let orchRunning = false;
  let wpmUpdateInterval = null;
  function updateWpmDisplay() {
    try {
      if (state22.mode !== "wpm" || !orchRunning) return;
      const status = orch.getStatus();
      const wpmEl = document.getElementById("wpmPx");
      if (wpmEl && status) {
        const wpm = status.wpm;
        const pxs = status.targetPxs;
        if (wpm != null && isFinite(wpm) && pxs != null && isFinite(pxs)) {
          wpmEl.textContent = `\u2248 ${Math.round(wpm)} WPM \u2192 ${Math.round(pxs)} px/s`;
        } else {
          wpmEl.textContent = "\u2248 \u2014 WPM";
        }
      }
    } catch {
    }
  }
  async function ensureOrchestratorForMode() {
    try {
      const wantsOrchestrator = state22.mode === "wpm" || state22.mode === "asr" || state22.mode === "hybrid" && hybridWantedRunning;
      if (wantsOrchestrator) {
        if (!orchRunning) {
          await orch.start(createVadEventAdapter());
          orch.setMode("assist");
          orchRunning = true;
          if (state22.mode === "wpm") {
            if (wpmUpdateInterval) clearInterval(wpmUpdateInterval);
            wpmUpdateInterval = setInterval(updateWpmDisplay, 200);
          }
        }
      } else if (orchRunning) {
        await orch.stop();
        orchRunning = false;
        if (wpmUpdateInterval) {
          clearInterval(wpmUpdateInterval);
          wpmUpdateInterval = null;
        }
      }
    } catch {
    }
  }
  ensureOrchestratorForMode();
  try {
    const wpmTargetInput = document.getElementById("wpmTarget");
    if (wpmTargetInput) {
      const stored = localStorage.getItem("tp_baseline_wpm");
      const parsed = stored != null ? Number(stored) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        setSliderValueSilently(wpmTargetInput, String(parsed));
      } else if (stored != null) {
        try {
          localStorage.removeItem("tp_baseline_wpm");
        } catch {
        }
      }
    }
  } catch {
  }
  let userEnabled = false;
  let userIntentOn = false;
  let dbGate = false;
  let vadGate = false;
  let gatePref = getUiPrefs().hybridGate;
  let hardNoMatchSinceMs = 0;
  let lastHybridPolicyLogAt = 0;
  let sessionIntentOn = false;
  let sessionPhase2 = "idle";
  hybridSessionPhase = sessionPhase2;
  const HYBRID_AUTO_STOP_FATAL_REASONS = /* @__PURE__ */ new Set(["session", "session-stop", "user-toggle"]);
  function isFatalAutoStopReason(reason) {
    if (!reason) return false;
    try {
      return HYBRID_AUTO_STOP_FATAL_REASONS.has(reason.toLowerCase());
    } catch {
      return true;
    }
  }
  function shouldIgnoreHybridStop(reason, enabled) {
    if (enabled) return false;
    if (state22.mode !== "hybrid") return false;
    if (sessionPhase2 !== "live") return false;
    return !isFatalAutoStopReason(reason);
  }
  try {
    const storedPhase = appStoreSingleton.get?.("session.phase");
    if (storedPhase) {
      sessionPhase2 = String(storedPhase);
      hybridSessionPhase = sessionPhase2;
    }
  } catch {
  }
  if (!scrollIntentListenerWired) {
    scrollIntentListenerWired = true;
    onScrollIntent((intent) => {
      try {
        if (!intent || intent.source !== "asr") return;
        if (shouldBlockLegacyAsrIntentLane()) {
          if (!legacyAsrIntentLaneBlockedLogged) {
            legacyAsrIntentLaneBlockedLogged = true;
            if (isDevMode2()) {
              try {
                console.info("[ASR] ignoring legacy tp:scroll:intent (driver-owned commit lane)");
              } catch {
              }
            }
          }
          return;
        }
        const telemetry = getAsrTelemetry();
        const intentReason = typeof intent.reason === "string" ? intent.reason : "";
        recordAsrIntentTelemetry(telemetry, intentReason);
        const now2 = Date.now();
        const mode = getScrollMode2();
        recordAsrMatchEvent(now2, intent, intentReason);
        if (telemetry) {
          telemetry.completionEvidence = null;
          telemetry.completionEvidenceSummary = "evidence_missing_block_index";
        }
        if (intent.kind !== "seek_block") {
          recordAsrReject(
            telemetry,
            now2,
            "reject_kind",
            mode,
            sessionPhase2,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (mode !== "asr") {
          recordAsrReject(
            telemetry,
            now2,
            "reject_mode",
            mode,
            sessionPhase2,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (sessionPhase2 !== "live") {
          recordAsrReject(
            telemetry,
            now2,
            "reject_phase",
            mode,
            sessionPhase2,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (isDevMode2()) {
          const autoEnabled = !!(auto?.getState?.().enabled || enabledNow);
          const autoRunning = !!auto?.isRunning?.();
          const hybridRunning = !!hybridMotor?.isRunning?.();
          if (autoEnabled || autoRunning || hybridRunning) {
            if (!asrMotorConflictLogged) {
              asrMotorConflictLogged = true;
              try {
                console.error("[ASR_ASSERT] motor running in ASR mode", {
                  autoEnabled,
                  autoRunning,
                  hybridRunning,
                  mode,
                  phase: sessionPhase2
                });
              } catch {
              }
            }
            stopAllMotors("asr-assert-motor-running");
          }
        }
        if (committedBlockIdx < 0) {
          const seed = resolveCurrentBlockIdx();
          if (seed != null) {
            committedBlockIdx = seed;
          }
        }
        if (telemetry && committedBlockIdx >= 0) {
          const candidateIdx = resolveAsrIntentCandidateBlockIdx(intent);
          const evidence = buildCompletionEvidence(committedBlockIdx, candidateIdx, now2);
          telemetry.completionEvidence = evidence;
          telemetry.completionEvidenceSummary = formatCompletionEvidenceSummary(evidence);
        } else if (telemetry) {
          telemetry.completionEvidence = null;
          telemetry.completionEvidenceSummary = "evidence_missing_block_index";
        }
        if (asrIntentLiveSince && now2 - asrIntentLiveSince < ASR_INTENT_WARMUP_MS) {
          recordAsrReject(
            telemetry,
            now2,
            "reject_warmup",
            mode,
            sessionPhase2,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        const rawBlockIdx = Number(intent?.target?.blockIdx);
        if (!Number.isFinite(rawBlockIdx) || rawBlockIdx < 0) {
          recordAsrReject(
            telemetry,
            now2,
            "reject_invalid_target",
            mode,
            sessionPhase2,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        const blockIdx = Math.min(rawBlockIdx, committedBlockIdx + 1);
        if (blockIdx <= committedBlockIdx) {
          const reasonKey = rawBlockIdx === committedBlockIdx ? "reject_same_block" : "reject_backward";
          recordAsrReject(
            telemetry,
            now2,
            reasonKey,
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (now2 - lastCommitAt < ASR_INTENT_DEBOUNCE_MS) {
          recordAsrReject(
            telemetry,
            now2,
            "reject_debounce",
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (Number.isFinite(intent.confidence) && intent.confidence < ASR_INTENT_MIN_CONF) {
          recordAsrReject(
            telemetry,
            now2,
            "reject_low_confidence",
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        const isFinal = intentReason.includes("final");
        const isInterim = intentReason.includes("interim") && !isFinal;
        const isRescue = intentReason.includes("rescue");
        if (isInterim) {
          if (blockIdx !== lastCandidate) {
            lastCandidate = blockIdx;
            stableSince = now2;
          }
          recordAsrReject(
            telemetry,
            now2,
            "reject_not_final",
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (isRescue) {
          recentAsrMatches = [];
          lastCandidate = -1;
          stableSince = now2;
          recordAsrReject(
            telemetry,
            now2,
            "reject_rescue",
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        if (blockIdx !== lastCandidate) {
          lastCandidate = blockIdx;
          stableSince = now2;
          recordAsrReject(
            telemetry,
            now2,
            "reject_stability",
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        const requiredStable = committedBlockIdx < 0 ? ASR_INTENT_FIRST_STABLE_MS : ASR_INTENT_STABLE_MS;
        if (now2 - stableSince < requiredStable) {
          recordAsrReject(
            telemetry,
            now2,
            "reject_stability",
            mode,
            sessionPhase2,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary
          );
          return;
        }
        const completionGateEnabled = isAsrCompletionGateEnabled();
        let completionDecisionConfidence;
        let completionStatus = "complete";
        let completionReason;
        if (completionGateEnabled) {
          let completionEvidence = telemetry?.completionEvidence ?? null;
          if (!completionEvidence) {
            try {
              completionEvidence = buildCompletionEvidence(committedBlockIdx, blockIdx, now2);
            } catch (err) {
              if (isDevMode2()) {
                try {
                  console.warn("[ASR_COMPLETION] evidence build failed", { err });
                } catch {
                }
              }
              completionStatus = "unknown";
              completionReason = "exception";
            }
          }
          if (telemetry) {
            telemetry.completionEvidence = completionEvidence;
            telemetry.completionEvidenceSummary = formatCompletionEvidenceSummary(completionEvidence);
          }
          if (completionStatus === "unknown" && completionReason === "exception") {
          } else if (!completionEvidence) {
            completionStatus = "unknown";
            completionReason = "insufficient_evidence";
          } else {
            let completionDecision;
            try {
              completionDecision = decideBlockCompletion(completionEvidence);
            } catch (err) {
              if (isDevMode2()) {
                try {
                  console.warn("[ASR_COMPLETION] decision failed", { err });
                } catch {
                }
              }
              completionStatus = "unknown";
              completionReason = "exception";
            }
            if (completionDecision) {
              if (completionDecision.ok) {
                completionDecisionConfidence = completionDecision.confidence;
                completionStatus = "complete";
                completionReason = completionDecision.reason;
              } else if (completionDecision.status === "incomplete") {
                recordAsrReject(
                  telemetry,
                  now2,
                  `reject_completion_${completionDecision.reason}`,
                  mode,
                  sessionPhase2,
                  committedBlockIdx,
                  blockIdx,
                  telemetry?.completionEvidenceSummary
                );
                return;
              } else {
                completionStatus = "unknown";
                completionReason = completionDecision.reason;
              }
            }
          }
        } else if (isDevMode2() && !asrCompletionGateBypassLogged) {
          asrCompletionGateBypassLogged = true;
          try {
            console.debug("[ASR_COMPLETION] gate bypassed (flag off)");
          } catch {
          }
        }
        seekToBlockAnimated(blockIdx, "asr_commit");
        committedBlockIdx = blockIdx;
        lastCommitAt = now2;
        recordAsrAccept(
          telemetry,
          now2,
          mode,
          sessionPhase2,
          committedBlockIdx,
          blockIdx,
          telemetry?.completionEvidenceSummary,
          completionDecisionConfidence,
          completionStatus,
          completionReason
        );
      } catch {
      }
    });
    try {
      console.info("[scroll-router] tp:scroll:intent listener installed");
    } catch {
    }
  }
  let lastAutoIntentMotorRequest = { kind: "auto", source: "unknown" };
  function normalizeRequestedMotorKind(raw) {
    const value = String(raw || "").toLowerCase();
    if (value === "auto" || value === "hybrid") return value;
    return null;
  }
  function resolveAutoIntentMotorRequest(detail, mode, reasonRaw) {
    const source = typeof detail?.source === "string" ? detail.source : reasonRaw || "unknown";
    if (mode === "asr") return { kind: "auto", source };
    const explicit = normalizeRequestedMotorKind(detail?.motorKind) || normalizeRequestedMotorKind(detail?.kind) || normalizeRequestedMotorKind(detail?.intent?.kind);
    if (explicit) return { kind: explicit, source };
    if (mode === "hybrid") return { kind: "hybrid", source };
    return { kind: "auto", source };
  }
  function resolveAutoIntentEnabled(detail) {
    if (typeof detail.enabled === "boolean") return detail.enabled;
    if (typeof detail.on === "boolean") return detail.on;
    return void 0;
  }
  function resolveAutoIntentReason(detail) {
    return typeof detail.reason === "string" ? detail.reason : void 0;
  }
  function setAutoIntentState(on, _reason) {
    if (on && state22.mode === "hybrid" && !hasActiveAsrProfile()) {
      try {
        showToast("Select a saved mic calibration to use ASR/Hybrid.", { type: "warning" });
      } catch {
      }
      try {
        focusSidebarCalibrationSelect();
      } catch {
      }
      return;
    }
    userIntentOn = on;
    userEnabled = on;
    hybridWantedRunning = on;
    sessionIntentOn = on;
    if (hybridWantedRunning && state22.mode === "hybrid") {
      seedHybridBaseSpeed2();
      ensureOrchestratorForMode();
    }
    if (!hybridWantedRunning) {
      hybridSilence.pausedBySilence = false;
      clearHybridSilenceTimer();
    }
    persistStoredAutoEnabled(on);
    try {
      applyGate();
    } catch {
    }
  }
  function handleAutoIntent(detail) {
    try {
      const enabled = resolveAutoIntentEnabled(detail);
      if (typeof enabled !== "boolean") return null;
      const reasonRaw = resolveAutoIntentReason(detail);
      const mode = getScrollMode2();
      const currentPhase = String(appStoreSingleton.get("session.phase") || sessionPhase2);
      const asrArmed = !!appStoreSingleton.get("session.asrArmed");
      const reasonNormalized = String(reasonRaw || "").trim().toLowerCase();
      const reasonCompact = reasonNormalized.replace(/[^a-z]/g, "");
      const isScriptEndReason = reasonCompact === "scriptend";
      const ignoreAsrScriptEnd = !enabled && isScriptEndReason && mode === "asr" && currentPhase === "live" && asrArmed;
      if (ignoreAsrScriptEnd) {
        if (isDevMode2()) {
          try {
            console.warn("[AUTO_INTENT] scriptEnd ignored in live armed ASR", {
              enabled,
              reason: reasonRaw ?? null,
              mode,
              phase: currentPhase,
              asrArmed
            });
          } catch {
          }
        }
        return null;
      }
      if (shouldIgnoreHybridStop(reasonRaw, enabled)) {
        try {
          console.info("[AUTO_INTENT] hybrid stop ignored (live, non-fatal reason)", { reason: reasonRaw });
        } catch {
        }
        return null;
      }
      const motorRequest = resolveAutoIntentMotorRequest(detail, mode, reasonRaw);
      lastAutoIntentMotorRequest = motorRequest;
      setAutoIntentState(enabled, reasonRaw);
      const allowAutoMotor = mode !== "asr";
      const brain = String(appStoreSingleton.get("scrollBrain") || "auto");
      const baseDecision = enabled ? "motor-start-request" : "motor-stop-request";
      const decision = allowAutoMotor ? baseDecision : "motor-stop-request";
      const pxPerSec = typeof getCurrentSpeed === "function" ? getCurrentSpeed() : void 0;
      try {
        console.info(
          `[scroll-router] tp:auto:intent mode=${state22.mode} brain=${brain} phase=${sessionPhase2} decision=${decision} userEnabled=${userEnabled} motorKind=${motorRequest.kind} source=${motorRequest.source}`
        );
        console.warn(
          "[AUTO_INTENT]",
          "mode=",
          state22.mode,
          "enabled=",
          enabled,
          "motorKind=",
          motorRequest.kind,
          "source=",
          motorRequest.source,
          "pxPerSec=",
          pxPerSec,
          "sessionPhase=",
          currentPhase,
          "userEnabled=",
          userEnabled
        );
      } catch {
      }
      const pxs = Number(pxPerSec) || 0;
      enabledNow = decision === "motor-start-request";
      if (!allowAutoMotor) {
        clearActiveMotor("auto");
      }
      try {
        emitMotorState2("auto", enabledNow);
      } catch {
      }
      try {
        emitAutoState();
      } catch {
      }
      return {
        enabled,
        decision,
        pxs,
        reason: reasonRaw,
        motorKind: motorRequest.kind,
        motorSource: motorRequest.source
      };
    } catch {
    }
    return null;
  }
  function processAutoIntent(detail) {
    const payload = handleAutoIntent(detail);
    if (!payload) return;
    const { enabled, decision, pxs, reason, motorKind, motorSource } = payload;
    const mode = getScrollMode2();
    const currentPhase = String(appStoreSingleton.get("session.phase") || sessionPhase2);
    if (enabled && currentPhase !== "live") {
      try {
        console.info("[AUTO_INTENT] start ignored: session not live", {
          mode,
          phase: currentPhase,
          reason: reason ?? "unknown"
        });
      } catch {
      }
      return;
    }
    const pxps = typeof getCurrentSpeed === "function" ? getCurrentSpeed() : void 0;
    const chosenMotor = mode === "hybrid" ? "hybrid" : "auto";
    try {
      console.warn("[AUTO_INTENT] processor RUN", {
        enabled,
        mode,
        motorKind,
        source: motorSource,
        pxps,
        chosenMotor,
        viewerRole,
        lastWpm: lastWpmIntent?.wpm ?? null
      });
    } catch {
    }
    if (mode === "asr") {
      stopAutoMotor("auto-intent:asr");
      return;
    }
    if (mode === "hybrid") {
      if (enabled) {
        if (!ensureMainViewer("hybrid.start")) {
          return;
        }
        if (!userEnabled) {
          try {
            console.info("[HYBRID_MOTOR] user disabled -> no actuation");
          } catch {
          }
          return;
        }
        if (sessionPhase2 !== "live") {
          try {
            console.info("[HYBRID_MOTOR] not live -> no actuation", { phase: sessionPhase2 });
          } catch {
          }
          return;
        }
        if (!Number.isFinite(hybridBasePxps) || hybridBasePxps <= 0) {
          const fallbackWpm = lastWpmIntent?.wpm ?? 140;
          const fallbackPx = convertWpmToPxPerSec(fallbackWpm);
          try {
            console.warn("[HYBRID_MOTOR] basePxps missing -> seed from WPM", { fallbackWpm });
            if (Number.isFinite(fallbackPx) && fallbackPx > 0) {
              applyWpmBaselinePx(fallbackPx, "hybrid-seed", fallbackWpm);
            }
          } catch (err) {
            try {
              console.error("[HYBRID_MOTOR] baseline seed FAILED", err);
            } catch {
            }
          }
        }
        try {
          seedHybridBaseSpeed2();
          startHybridMotorFromSpeedChange();
          hybridMotor.setEnabled?.(true);
          hybridMotor.start?.();
          setActiveMotor("hybrid", "hybrid");
          console.warn("[HYBRID_MOTOR] start/enable ok", {
            reason: reason ?? "auto-intent",
            phase: sessionPhase2,
            baselinePxps: hybridBasePxps
          });
        } catch (err) {
          try {
            console.error("[HYBRID_MOTOR] start/enable FAILED", err);
          } catch {
          }
        }
      } else {
        try {
          if (hybridMotor.isRunning()) {
            hybridMotor.stop();
            clearActiveMotor("hybrid");
            emitMotorState2("hybridWpm", false);
          }
          emitHybridSafety();
        } catch {
        }
      }
      return;
    }
    if (decision === "motor-start-request") {
      try {
        auto.setSpeed?.(pxs);
      } catch {
      }
      try {
        if (!auto.isRunning?.()) {
          auto.start?.();
        }
      } catch {
      }
      try {
        auto.setEnabled?.(true);
      } catch {
      }
      setActiveMotor("auto", mode);
      scheduleCiAutoMovement();
    } else {
      stopAutoMotor("auto-intent:stop");
    }
  }
  autoIntentProcessor = (detail) => {
    try {
      processAutoIntent(detail);
    } catch (err) {
      console.error("[AUTO_INTENT] PROCESS crash", err);
      throw err;
    }
  };
  console.warn("[AUTO_INTENT] processor assigned", { hasPending: !!pendingAutoIntentDetail });
  if (pendingAutoIntentDetail) {
    console.warn("[AUTO_INTENT] flushing pending", pendingAutoIntentDetail);
    try {
      autoIntentProcessor(pendingAutoIntentDetail);
    } catch {
    }
    pendingAutoIntentDetail = null;
  }
  try {
    console.info("[scroll-router] tp:auto:intent listener installed");
  } catch {
  }
  try {
    window.addEventListener("tp:speech-state", (e) => {
      try {
        const detail = e?.detail || {};
        const running = !!detail.running;
        const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
        if (running) {
          noteHybridSpeechActivity(ts, { source: "speech-state" });
        }
      } catch {
      }
    });
  } catch {
  }
  enabledNow = (() => {
    try {
      return !!opts.auto.getState?.().enabled;
    } catch {
      return false;
    }
  })();
  try {
    if (enabledNow) {
      setActiveMotor("auto", getScrollMode2());
    }
  } catch {
  }
  let silenceTimer;
  const chipEl = () => document.getElementById("autoChip");
  function emitAutoState(label = "Auto") {
    try {
      const chip = chipEl();
      const gate = userEnabled ? enabledNow ? "on" : "paused" : "manual";
      const speed = getCurrentSpeed();
      const payload = {
        mode: getScrollMode2(),
        intentOn: !!userIntentOn,
        gate,
        speed,
        label,
        chip: (chip && chip.textContent || "").trim()
      };
      try {
        (window.__tp_onAutoStateChange || null) && window.__tp_onAutoStateChange(payload);
      } catch {
      }
      try {
        document.dispatchEvent(new CustomEvent("tp:autoState", { detail: payload }));
      } catch {
      }
    } catch {
    }
  }
  function setAutoChip(state3, detail, label = "Auto") {
    const el = chipEl();
    if (!el) return;
    const stateLabel = state3 === "on" ? "On" : state3 === "paused" ? "Paused" : "Manual";
    el.textContent = `${label}: ${stateLabel}`;
    el.classList.remove("on", "paused", "manual");
    el.classList.add(state3);
    el.setAttribute("data-state", state3);
    if (detail) el.title = detail;
  }
  function emitMotorState2(source, running) {
    try {
      const payload = { source, running };
      try {
        const handler = window.__tp_onMotorStateChange;
        if (typeof handler === "function") handler(payload);
      } catch {
      }
      try {
        window.dispatchEvent(new CustomEvent("tp:motorState", { detail: payload }));
      } catch {
      }
      try {
        document.dispatchEvent(new CustomEvent("tp:motorState", { detail: payload }));
      } catch {
      }
      try {
        window.dispatchEvent(new CustomEvent("tp:motor:state", { detail: payload }));
      } catch {
      }
      try {
        document.dispatchEvent(new CustomEvent("tp:motor:state", { detail: payload }));
      } catch {
      }
      emitScrollModeSnapshot(`motor:${source}:${running ? "on" : "off"}`);
    } catch {
    }
  }
  function emitScrollModeSnapshot(reason) {
    try {
      const mode = getScrollMode2();
      const payload = {
        reason: reason || "state",
        mode,
        phase: sessionPhase2,
        brain: String(appStoreSingleton.get("scrollBrain") || "auto"),
        clamp: mode === "hybrid" || mode === "asr" ? "follow" : "free",
        userEnabled: !!userEnabled,
        sessionIntentOn: !!sessionIntentOn,
        autoRunning: typeof auto?.isRunning === "function" ? !!auto.isRunning() : false,
        hybridRunning: hybridMotor?.isRunning?.() ?? false,
        hybridWantedRunning: !!hybridWantedRunning,
        speechActive: !!speechActive,
        hybridPausedBySilence: !!hybridSilence.pausedBySilence
      };
      try {
        window.__tp_onScrollModeChange?.(payload);
      } catch {
      }
      try {
        window.dispatchEvent(new CustomEvent("tp:scroll:mode", { detail: payload }));
      } catch {
      }
      try {
        document.dispatchEvent(new CustomEvent("tp:scroll:mode", { detail: payload }));
      } catch {
      }
    } catch {
    }
  }
  function canRunHybridMotor() {
    try {
      const phase = appStoreSingleton.get("session.phase");
      const allow = appStoreSingleton.get("session.scrollAutoOnLive");
      if (phase !== "live") return false;
      return !!allow;
    } catch {
      return false;
    }
  }
  function isHybridSessionEligible() {
    return state22.mode === "hybrid" && sessionPhase2 === "live" && userEnabled;
  }
  function handleHybridSilenceTimeout2() {
    hybridSilence.timeoutId = null;
    const now2 = nowMs();
    if (liveGraceWindowEndsAt != null && now2 >= liveGraceWindowEndsAt) {
      liveGraceWindowEndsAt = null;
    }
    if (liveGraceWindowEndsAt != null && now2 < liveGraceWindowEndsAt) {
      const delay = Math.max(0, liveGraceWindowEndsAt - now2);
      armHybridSilenceTimer2(delay || computeHybridSilenceDelayMs());
      return;
    }
    const softDelayMs = computeHybridSilenceDelayMs();
    const hardStopMs = HYBRID_SILENCE_HARD_STOP_MS;
    const lastSpeechAtMs = hybridSilence.lastSpeechAtMs > 0 ? hybridSilence.lastSpeechAtMs : now2;
    const silentForMs = Math.max(0, now2 - lastSpeechAtMs);
    const eligible = isHybridSessionEligible();
    const motorRunning = hybridMotor.isRunning();
    if (!eligible) {
      if (motorRunning) {
        hybridMotor.stop();
        clearActiveMotor("hybrid");
        emitMotorState2("hybridWpm", false);
      }
      hybridSilence.pausedBySilence = false;
      speechActive = false;
      hybridSilence.speechHoldUntilMs = now2;
      emitHybridSafety();
      try {
        applyGate();
      } catch {
      }
      return;
    }
    if (silentForMs >= hardStopMs) {
      if (motorRunning) {
        hybridMotor.stop();
        clearActiveMotor("hybrid");
        emitMotorState2("hybridWpm", false);
      }
      hybridSilence.pausedBySilence = false;
      speechActive = false;
      hybridSilence.speechHoldUntilMs = now2;
      emitHybridSafety();
      try {
        applyGate();
      } catch {
      }
      return;
    }
    if (!motorRunning) return;
    hybridSilence.pausedBySilence = true;
    speechActive = false;
    hybridSilence.speechHoldUntilMs = now2;
    runHybridVelocity(hybridSilence);
    emitHybridSafety();
    armHybridSilenceTimer2(softDelayMs);
    try {
      applyGate();
    } catch {
    }
  }
  try {
    window.__tp_handleHybridSilenceTimeout = handleHybridSilenceTimeout2;
  } catch {
  }
  function armHybridSilenceTimer2(delay = computeHybridSilenceDelayMs()) {
    clearHybridSilenceTimer();
    if (!isHybridSessionEligible()) return;
    if (!hybridMotor.isRunning() && !hybridWantedRunning) return;
    const nextDelay = Math.max(1, delay);
    hybridSilence.timeoutId = window.setTimeout(() => handleHybridSilenceTimeout2(), nextDelay);
  }
  function ensureHybridMotorRunningForSpeech() {
    if (getScrollMode2() !== "hybrid") {
      logHybridModeMismatch("ensureHybridMotorRunningForSpeech");
      return;
    }
    if (sessionPhase2 !== "live") return;
    if (!userEnabled || !hybridWantedRunning) return;
    runHybridVelocity(hybridSilence);
    if (!hybridMotor.isRunning()) {
      const startResult = hybridMotor.start();
      if (startResult.started) {
        emitMotorState2("hybridWpm", true);
        setActiveMotor("hybrid", "hybrid");
      }
    }
  }
  function startHybridMotorFromSpeedChange() {
    const modeNow = getScrollMode2();
    if (modeNow !== "hybrid") {
      logHybridModeMismatch("startHybridMotorFromSpeedChange");
      return;
    }
    if (sessionPhase2 !== "live") return;
    if (!userEnabled || !hybridWantedRunning) return;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    ensureHybridMotorRunningForSpeech();
    armHybridSilenceTimer2();
  }
  function isLiveGraceActive(now2 = nowMs()) {
    return liveGraceWindowEndsAt != null && now2 < liveGraceWindowEndsAt;
  }
  function noteHybridSpeechActivity(ts, opts2) {
    if (getScrollMode2() !== "hybrid") {
      logHybridModeMismatch(opts2?.source ?? "speech");
      return;
    }
    const perfNow = nowMs();
    const now2 = normalizePerfTimestamp(ts, perfNow);
    if (typeof opts2?.noMatch === "boolean") {
      hybridLastNoMatch = opts2.noMatch;
    }
    const wasSpeechActive = speechActive;
    speechActive = true;
    markHybridSpeechPresent(now2);
    hybridSilence.lastSpeechAtMs = now2;
    setHybridSilence2(now2);
    liveGraceWindowEndsAt = null;
    const wasPausedBySilence = typeof opts2?.resumedFromSilence === "boolean" ? opts2.resumedFromSilence : hybridSilence.pausedBySilence;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    const shouldStartGrace = !opts2?.noMatch && (wasPausedBySilence || !wasSpeechActive);
    if (shouldStartGrace) {
      startHybridGrace(opts2?.source ?? "speech-result");
    }
    const effectivePxps = Number.isFinite(hybridBasePxps) ? hybridBasePxps * hybridScale : 0;
    const speechPayload = {
      source: opts2?.source ?? "unknown",
      noMatch: !!opts2?.noMatch,
      pausedBySilence: wasPausedBySilence,
      offScriptActive: hybridSilence.offScriptActive,
      effectivePxPerSec: Number.isFinite(effectivePxps) ? Number(effectivePxps.toFixed(2)) : effectivePxps
    };
    try {
      console.info("[HYBRID] speech activity", speechPayload);
    } catch {
    }
    try {
      console.info("[speech] activity", speechPayload);
    } catch {
    }
    if (wasPausedBySilence) {
      emitHybridSafety();
    }
    if (!hybridWantedRunning) return;
    ensureHybridMotorRunningForSpeech();
    armHybridSilenceTimer2();
    try {
      applyGate();
    } catch {
    }
  }
  function determineHybridScaleFromDetail(detail) {
    const simRaw = detail.bestSim ?? detail.sim ?? detail.score;
    const sim = Number.isFinite(simRaw) ? Number(simRaw) : NaN;
    const inBandValue = detail.inBand;
    const inBand = inBandValue === 1 || inBandValue === true || inBandValue === "1";
    if (inBand) return RECOVERY_SCALE;
    if (!Number.isFinite(sim)) return null;
    if (sim >= HYBRID_ON_SCRIPT_SIM) return RECOVERY_SCALE;
    if (sim >= HYBRID_OFFSCRIPT_MILD_SIM) return OFFSCRIPT_MILD;
    return OFFSCRIPT_DEEP;
  }
  function updateHybridScaleFromDetail(detail) {
    if (state22.mode !== "hybrid" || !hybridWantedRunning) return;
    const now2 = nowMs();
    const runtime = getHybridBlockRuntimeState();
    const blocksNotReadyHold = isHybridBlocksNotReadyHold(now2, runtime);
    if (blocksNotReadyHold) {
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
      if (hybridSilence.offScriptActive) {
        hybridSilence.offScriptActive = false;
      }
      if (Number.isFinite(hybridScale) && hybridScale !== RECOVERY_SCALE) {
        setHybridScale2(RECOVERY_SCALE);
      }
      logHybridMatcherProbe("scale-hold:blocks-not-ready", {
        blocksReady: runtime.blocksReady,
        blockCount: runtime.blockCount,
        blockSource: runtime.blockSource,
        scriptHash: runtime.scriptHash,
        scriptSig: runtime.scriptSig,
        backendReady: runtime.backendReady,
        matcherSource: runtime.matcherSource,
        matcherSourceDetail: runtime.matcherSourceDetail
      });
      return;
    }
    const inBandValue = detail.inBand;
    const inBand = inBandValue === 1 || inBandValue === true || inBandValue === "1";
    const bestSimRaw = detail.bestSim ?? detail.sim ?? detail.score;
    const bestSim = Number.isFinite(bestSimRaw) ? Number(bestSimRaw) : null;
    if (bestSim !== null && bestSim >= HYBRID_HARD_NOMATCH_SIM_MIN) {
      hybridLastNoMatch = false;
    }
    const scaleDetail = { ...detail, bestSim, sim: bestSim ?? detail.sim };
    const nextScale = determineHybridScaleFromDetail(scaleDetail);
    if (nextScale == null) return;
    const logHud = () => {
      syncOffScriptDuration(now2);
      const currentScale = Number.isFinite(hybridScale) ? hybridScale : 1;
      const decay = hybridSilence.offScriptActive ? computeOffScriptDecay(offScriptDurationMs) : 1;
      const effectiveScale = currentScale * decay;
      logHybridOffScriptHud({
        bestSim,
        inBand,
        offScriptEvidence,
        offScriptActive: hybridSilence.offScriptActive,
        offScriptDurationMs,
        nextScale,
        effectiveScale
      });
    };
    const isNoMatch = detail.noMatch === true;
    const significantNoMatch = isNoMatch && !isWeakNoMatch(detail);
    const goodMatch = nextScale === RECOVERY_SCALE && !significantNoMatch;
    if (goodMatch) {
      onScriptStreak += 1;
      lastGoodMatchAtMs = now2;
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
      setHybridScale2(RECOVERY_SCALE);
      logHybridTrace(
        "evidence_counters",
        {
          source: "good-match",
          onScriptStreak,
          offScriptEvidence,
          offScriptActive: hybridSilence.offScriptActive,
          bestSim,
          noMatch: isNoMatch,
          nextScale
        },
        {
          signature: `good|${onScriptStreak}|${offScriptEvidence}|${hybridSilence.offScriptActive ? 1 : 0}|${Number(bestSim ?? NaN).toFixed(2)}`
        }
      );
      logHud();
      return;
    }
    if (significantNoMatch) {
      onScriptStreak = 0;
    }
    const offscriptCandidate = nextScale < RECOVERY_SCALE;
    const shouldCountOffscript = offscriptCandidate && (significantNoMatch || !isNoMatch);
    if (!shouldCountOffscript) {
      logHud();
      return;
    }
    onScriptStreak = 0;
    if (lastOffScriptEvidenceTs && now2 - lastOffScriptEvidenceTs > OFFSCRIPT_EVIDENCE_RESET_MS) {
      offScriptEvidence = 0;
    }
    lastOffScriptEvidenceTs = now2;
    offScriptEvidence += 1;
    if (offScriptEvidence >= OFFSCRIPT_EVIDENCE_THRESHOLD) {
      offScriptEvidence = 0;
      setHybridScale2(nextScale);
    }
    logHybridTrace(
      "evidence_counters",
      {
        source: "offscript",
        onScriptStreak,
        offScriptEvidence,
        offScriptActive: hybridSilence.offScriptActive,
        bestSim,
        noMatch: isNoMatch,
        significantNoMatch,
        nextScale
      },
      {
        signature: `off|${onScriptStreak}|${offScriptEvidence}|${hybridSilence.offScriptActive ? 1 : 0}|${Number(bestSim ?? NaN).toFixed(2)}|${significantNoMatch ? 1 : 0}`
      }
    );
    logHud();
  }
  function handleTranscriptEvent(detail) {
    if (getScrollMode2() !== "hybrid") return;
    const perfNow = nowMs();
    const now2 = normalizePerfTimestamp(detail.timestamp, perfNow);
    hybridMatcherSource = "tp:speech:transcript";
    hybridMatcherSourceDetail = String(detail.source || "speech-loader");
    const isNoMatch = detail.noMatch === true;
    const inBand = detail.inBand === true || detail.inBand === 1 || detail.inBand === "1";
    const bestIdxRaw = detail.bestIdx ?? detail.line ?? detail.idx ?? detail.match?.bestIdx;
    const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.max(0, Math.floor(Number(bestIdxRaw))) : -1;
    const simRaw = detail.bestSim ?? detail.sim ?? detail.score ?? detail.match?.bestSim;
    const parsedBestSim = Number.isFinite(Number(simRaw)) ? Number(simRaw) : Number.NaN;
    const inferredBestSim = Number.isFinite(parsedBestSim) ? parsedBestSim : isNoMatch ? Number.NaN : inBand ? HYBRID_ON_SCRIPT_SIM : HYBRID_OFFSCRIPT_MILD_SIM;
    const currentIdxRaw = detail.currentIdx ?? detail.match?.currentIdx ?? window?.currentIndex;
    const currentIdx = Number.isFinite(Number(currentIdxRaw)) ? Math.max(0, Math.floor(Number(currentIdxRaw))) : lastAsrMatch.currentIndex;
    const speechPresentNow = isHybridSpeechPresent(now2);
    const ingressMatchState = getHybridMatchState();
    logHybridTrace(
      "transcript_ingress",
      {
        source: detail.source || "speech-loader",
        noMatch: isNoMatch,
        bestIdx,
        sim: Number.isFinite(inferredBestSim) ? Number(inferredBestSim.toFixed(3)) : null,
        speechPresent: speechPresentNow,
        hardNoMatch: ingressMatchState.hardNoMatch
      },
      {
        throttleMs: 60,
        signature: `${isNoMatch ? 1 : 0}|${bestIdx}|${Number(inferredBestSim).toFixed(3)}|${speechPresentNow ? 1 : 0}|${ingressMatchState.hardNoMatch ? 1 : 0}`
      }
    );
    if (!isNoMatch && bestIdx >= 0) {
      hybridMatchSeen = true;
      hybridLastMatch = {
        bestIdx,
        bestSim: inferredBestSim,
        isFinal: Boolean(detail.isFinal ?? detail.final),
        ts: now2
      };
      lastAsrMatch = {
        currentIndex: currentIdx,
        bestIndex: bestIdx,
        bestSim: inferredBestSim
      };
      if (Number.isFinite(inferredBestSim) && inferredBestSim >= HYBRID_HARD_NOMATCH_SIM_MIN) {
        hybridLastNoMatch = false;
      }
      logHybridTrace(
        "match_latch",
        {
          latchedMatch: true,
          bestIdx,
          sim: Number.isFinite(inferredBestSim) ? Number(inferredBestSim.toFixed(3)) : null,
          isFinal: Boolean(detail.isFinal ?? detail.final),
          currentIdx
        },
        {
          signature: `${bestIdx}|${Number(inferredBestSim).toFixed(3)}|${Boolean(detail.isFinal ?? detail.final) ? 1 : 0}|${currentIdx}`
        }
      );
    }
    const wasSilent = hybridSilence.pausedBySilence;
    hybridSilence.lastSpeechAtMs = now2;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    noteHybridSpeechActivity(now2, {
      source: detail.source || "transcript",
      noMatch: isNoMatch,
      resumedFromSilence: wasSilent
    });
    updateHybridScaleFromDetail(detail);
  }
  const handleHybridFatalOnce = (err) => {
    if (hybridSilence.erroredOnce) return;
    if (state22.mode !== "hybrid" || !hybridWantedRunning) return;
    hybridSilence.erroredOnce = true;
    try {
      console.error("[HYBRID] disabling due to handler error", err);
    } catch {
    }
    try {
      clearHybridSilenceTimer();
    } catch {
    }
    try {
      hybridWantedRunning = false;
    } catch {
    }
    try {
      stopAllMotors("hybrid guard fatal");
    } catch {
    }
    try {
      emitHybridSafety();
    } catch {
    }
    try {
      applyMode("wpm");
      emitScrollModeSnapshot("mode-change");
    } catch {
    }
    try {
      if (window.toast) {
        window.toast("Hybrid disabled after runtime error");
      }
    } catch {
    }
  };
  try {
    window.addEventListener("tp:asr:sync", (ev) => {
      const detail = ev.detail || {};
      const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
      if (getScrollMode2() !== "hybrid") return;
      hybridMatcherSource = "tp:asr:sync";
      hybridMatcherSourceDetail = String(detail.source || "sync");
      const noMatch = detail.noMatch === true;
      try {
        noteHybridSpeechActivity(ts, { source: "sync", noMatch });
      } catch (err) {
        handleHybridFatalOnce(err);
        return;
      }
      const simRaw = detail.bestSim ?? detail.sim ?? detail.score;
      const bestSim = Number.isFinite(simRaw) ? Number(simRaw) : NaN;
      const hasSim = Number.isFinite(bestSim);
      const bestIdxRaw = detail.bestIdx ?? detail.line;
      const bestIdx = Number.isFinite(bestIdxRaw) ? bestIdxRaw : -1;
      const currentIdxRaw = Number(window?.currentIndex ?? -1);
      const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : -1;
      lastAsrMatch = {
        currentIndex: currentIdx,
        bestIndex: bestIdx,
        bestSim: Number.isFinite(bestSim) ? bestSim : Number.NaN
      };
      updateHybridScaleFromDetail(detail);
      if (isDevMode2()) {
        try {
          console.info("[HYBRID] sync", {
            ts,
            bestSim: hasSim ? Number(bestSim.toFixed(3)) : null,
            bestIdx,
            currentIdx,
            noMatch,
            offScriptActive: hybridSilence.offScriptActive,
            pausedBySilence: hybridSilence.pausedBySilence,
            effectivePxPerSec: Number.isFinite(hybridBasePxps) ? Number((hybridBasePxps * hybridScale).toFixed(2)) : 0
          });
        } catch {
        }
      }
    });
  } catch {
  }
  try {
    window.addEventListener("tp:asr:guard", (ev) => {
      try {
        if (getScrollMode2() !== "hybrid") return;
        const detail = ev.detail || {};
        if (isDevMode2()) {
          try {
            console.info("[HYBRID] structural guard (no offscript decay)", {
              status: detail.status ?? null,
              reason: detail.reason ?? null,
              source: detail.source ?? null
            });
          } catch {
          }
        }
      } catch (err) {
        if (!guardHandlerErrorLogged) {
          guardHandlerErrorLogged = true;
          try {
            console.error("[HYBRID] guard handler failed", err);
          } catch {
          }
        }
      }
    });
  } catch {
  }
  try {
    window.addEventListener("tp:speech:transcript", (ev) => {
      try {
        const detail = ev.detail || {};
        handleTranscriptEvent(detail);
      } catch {
      }
    });
  } catch {
  }
  try {
    window.addEventListener("tp:hybrid:matchState", (ev) => {
      const detail = ev.detail || {};
      hybridMatcherSource = "tp:hybrid:matchState";
      hybridMatcherSourceDetail = String(detail.source || detail.reason || "match-state");
      const bestIdxRaw = detail.bestIdx;
      const bestSimRaw = detail.bestSim;
      const bestIdx = Number.isFinite(bestIdxRaw) ? bestIdxRaw : -1;
      const bestSimValue = Number.isFinite(bestSimRaw) ? bestSimRaw : Number.NaN;
      const ts = Number.isFinite(detail.ts) ? detail.ts : nowMs();
      hybridMatchSeen = true;
      hybridLastMatch = {
        bestIdx,
        bestSim: Number.isFinite(bestSimValue) ? bestSimValue : Number.NaN,
        isFinal: Boolean(detail.isFinal),
        ts
      };
      const currentIdxRaw = Number(window?.currentIndex ?? NaN);
      const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : lastAsrMatch.currentIndex;
      lastAsrMatch = {
        currentIndex: currentIdx,
        bestIndex: Number.isFinite(bestIdx) ? bestIdx : lastAsrMatch.bestIndex,
        bestSim: Number.isFinite(bestSimValue) ? bestSimValue : lastAsrMatch.bestSim
      };
    });
  } catch {
  }
  try {
    window.addEventListener("tp:hybrid:brake", handleHybridBrakeEvent);
    window.addEventListener("tp:hybrid:assist", handleHybridAssistEvent);
    window.addEventListener("tp:hybrid:targetHint", handleHybridTargetHintEvent);
    if (typeof document !== "undefined") {
      document.addEventListener("tp:hybrid:brake", handleHybridBrakeEvent);
      document.addEventListener("tp:hybrid:assist", handleHybridAssistEvent);
      document.addEventListener("tp:hybrid:targetHint", handleHybridTargetHintEvent);
    }
    try {
      window.__tpHybridListenersReady = true;
    } catch {
    }
  } catch {
  }
  function setHybridScale2(nextScale) {
    if (nextScale === RECOVERY_SCALE) {
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
    }
    const clamped = Math.max(0, Math.min(nextScale, 1));
    if (hybridScale === clamped) return false;
    const prevOffScript = hybridSilence.offScriptActive;
    hybridScale = clamped;
    const nextOffScript = clamped < RECOVERY_SCALE;
    hybridSilence.offScriptActive = nextOffScript;
    if (prevOffScript !== nextOffScript) {
      if (nextOffScript) {
        offScriptSinceMs = nowMs();
        offScriptDurationMs = 0;
      } else {
        resetOffScriptDuration();
      }
    }
    runHybridVelocity(hybridSilence);
    return true;
  }
  function getActiveBrakeFactor(now2 = nowMs()) {
    if (hybridBrakeState.expiresAt <= now2) {
      if (hybridBrakeState.factor !== 1 || hybridBrakeState.expiresAt !== 0) {
        hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
      }
      return 1;
    }
    return hybridBrakeState.factor;
  }
  function getActiveAssistBoost(now2 = nowMs(), pauseTailEligible = false) {
    if (hybridAssistState.expiresAt > now2) {
      return hybridAssistState.boostPxps;
    }
    const tailActive = pauseTailEligible && pauseAssistTailBoost > 0 && pauseAssistTailUntil > now2;
    if (tailActive) {
      return pauseAssistTailBoost;
    }
    if (pauseAssistTailBoost !== 0 || pauseAssistTailUntil !== 0) {
      pauseAssistTailBoost = 0;
      pauseAssistTailUntil = 0;
    }
    if (hybridAssistState.boostPxps !== 0 || hybridAssistState.expiresAt !== 0) {
      hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
    }
    return 0;
  }
  function handleHybridBrakeEvent(ev) {
    if (state22.mode !== "hybrid") return;
    const now2 = nowMs();
    const detail = ev?.detail || {};
    const factorRaw = Number(detail.factor);
    const safeFactor = Number.isFinite(factorRaw) ? clamp2(factorRaw, 0, 1) : 1;
    const ttlRaw = Number.isFinite(Number(detail.ttlMs)) ? Number(detail.ttlMs) : HYBRID_BRAKE_DEFAULT_TTL;
    const ttl = Math.max(HYBRID_EVENT_TTL_MIN, Math.min(HYBRID_EVENT_TTL_MAX, ttlRaw));
    const reason = typeof detail.reason === "string" ? detail.reason : null;
    if (reason === "asr-pursuit") {
      if (isDevMode2()) {
        const elapsed = now2 - lastIgnoredAsrPursuitLogAt;
        if (elapsed >= IGNORED_ASR_PURSUIT_LOG_THROTTLE_MS) {
          lastIgnoredAsrPursuitLogAt = now2;
          try {
            console.info(
              `[HYBRID_BRAKE] ignored asr-pursuit ${JSON.stringify({
                now: now2,
                safeFactor,
                ttl,
                reason
              })}`
            );
          } catch {
          }
        }
      }
      return;
    }
    const prev = hybridBrakeState;
    const prevActive = prev.expiresAt > now2;
    const prevFactor = prev.factor;
    const prevReason = prev.reason;
    const remaining = prev.expiresAt - now2;
    const FACTOR_EPS = 0.01;
    const REFRESH_WINDOW_MS = 120;
    const sameFactor = Math.abs(prevFactor - safeFactor) <= FACTOR_EPS;
    const sameReason = prevReason === reason;
    if (prevActive && sameFactor && sameReason && remaining > REFRESH_WINDOW_MS) {
      if (isDevMode2()) {
        try {
          console.info(
            `[HYBRID_BRAKE] ignore refresh ${JSON.stringify({
              now: now2,
              safeFactor,
              ttl,
              reason,
              remaining
            })}`
          );
        } catch {
        }
      }
      return;
    }
    if (safeFactor >= 0.999) {
      setHybridBrake(1, 0, null);
    } else {
      setHybridBrake(safeFactor, ttl, reason);
    }
    if (isDevMode2()) {
      try {
        console.warn(
          `[HYBRID_BRAKE_SET] ${JSON.stringify({
            now: now2,
            factor: hybridBrakeState.factor,
            ttl,
            expiresAt: hybridBrakeState.expiresAt,
            reason,
            prevActive,
            prevFactor,
            prevReason,
            remaining
          })}`
        );
      } catch {
      }
    }
  }
  function handleHybridAssistEvent(ev) {
    if (state22.mode !== "hybrid") return;
    const detail = ev?.detail || {};
    const boostRaw = Number.isFinite(Number(detail.boostPxps)) ? Number(detail.boostPxps) : 0;
    const boost = boostRaw > 0 ? Math.min(HYBRID_ASSIST_MAX_BOOST, boostRaw) : 0;
    const ttlRaw = Number.isFinite(Number(detail.ttlMs)) ? Number(detail.ttlMs) : HYBRID_ASSIST_DEFAULT_TTL;
    const ttl = Math.max(HYBRID_EVENT_TTL_MIN, Math.min(HYBRID_EVENT_TTL_MAX, ttlRaw));
    if (boost <= 0) {
      hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
    } else {
      hybridAssistState = {
        boostPxps: boost,
        expiresAt: nowMs() + ttl,
        reason: typeof detail.reason === "string" ? detail.reason : null
      };
    }
    pauseAssistTailBoost = 0;
    pauseAssistTailUntil = 0;
    scheduleHybridVelocityRefresh();
    runHybridVelocity(hybridSilence);
  }
  function handleHybridTargetHintEvent(ev) {
    const detail = ev?.detail || {};
    try {
      console.info("[HYBRID_CTRL] targetHint recv", {
        confidence: detail?.confidence,
        top: detail?.top,
        reason: detail?.reason
      });
    } catch {
    }
    const topRaw = Number(detail.targetTop ?? detail.top);
    if (!Number.isFinite(topRaw)) return;
    const top = topRaw;
    const confidenceRaw = Number.isFinite(Number(detail.confidence)) ? Number(detail.confidence) : 0;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    armHybridCommitBoostWindow(detail?.reason);
    const anchorTopRaw = Number(detail.anchorTop);
    const anchorTop = Number.isFinite(anchorTopRaw) ? anchorTopRaw : null;
    const markerPctRaw = Number(detail.markerPct);
    const markerPct = Number.isFinite(markerPctRaw) && markerPctRaw >= 0 && markerPctRaw <= 1 ? markerPctRaw : null;
    const lineIndexRaw = Number(detail.lineIndex ?? detail.anchorLine ?? detail.targetLine);
    const lineIndex = Number.isFinite(lineIndexRaw) && lineIndexRaw >= 0 ? lineIndexRaw : null;
    const resolvedTargetTop = Number.isFinite(anchorTopRaw) ? anchorTopRaw : top;
    if (Number.isFinite(resolvedTargetTop)) {
      hybridLastGoodTargetTop = resolvedTargetTop;
    }
    hybridTargetHintState = {
      top,
      confidence,
      reason: typeof detail.reason === "string" ? detail.reason : void 0,
      ts: nowMs(),
      anchorTop,
      markerPct,
      lineIndex
    };
  }
  function computeEffectiveHybridScale(now2, silence = hybridSilence, pauseLikelyOverride, forceOffScript = false, candidateErrorLines, weakMatch = false) {
    syncOffScriptDuration(now2);
    const pauseLikely = typeof pauseLikelyOverride === "boolean" ? pauseLikelyOverride : isPlannedPauseLikely();
    const scaleFromSilence = silence.pausedBySilence && pauseLikely ? PAUSE_DRIFT_SCALE : silence.pausedBySilence ? SILENCE_SCALE : 1;
    const offScriptActive = forceOffScript || silence.offScriptActive;
    const offScriptDecay = silence.offScriptActive ? computeOffScriptDecay(offScriptDurationMs) : 1;
    const scaleFromOffscript = offScriptActive ? OFFSCRIPT_SCALE * offScriptDecay : 1;
    const graceActive = isHybridGraceActive(now2);
    const scaleFromGrace = GRACE_MIN_SCALE;
    const nearTarget = Number.isFinite(candidateErrorLines ?? NaN) && Math.abs(candidateErrorLines ?? 0) <= HYBRID_CTRL_MODE_DEADBAND_LINES;
    const onScriptLocked = onScriptStreak >= 2 && now2 - lastGoodMatchAtMs < ON_SCRIPT_LOCK_HOLD_MS && !weakMatch && !offScriptActive && nearTarget;
    if (onScriptLocked) {
      return {
        scale: 1,
        reason: "on-script-lock",
        scaleFromSilence,
        scaleFromOffscript,
        scaleFromGrace,
        graceActive,
        pauseLikely,
        onScriptLocked,
        offScriptActive,
        pausedBySilence: silence.pausedBySilence,
        offScriptDurationMs: silence.offScriptActive ? offScriptDurationMs : 0,
        offScriptDecay
      };
    }
    let chosenScale = 1;
    let reason = "base";
    if (silence.pausedBySilence) {
      chosenScale = scaleFromSilence;
      reason = "silence";
    } else if (silence.offScriptActive) {
      chosenScale = scaleFromOffscript;
      reason = "offscript";
    } else if (graceActive) {
      chosenScale = scaleFromGrace;
      reason = "grace";
    } else {
      chosenScale = 1;
      reason = "base";
    }
    return {
      scale: chosenScale,
      reason,
      scaleFromSilence,
      scaleFromOffscript,
      scaleFromGrace,
      graceActive,
      pauseLikely,
      onScriptLocked,
      offScriptActive,
      pausedBySilence: silence.pausedBySilence,
      offScriptDurationMs: silence.offScriptActive ? offScriptDurationMs : 0,
      offScriptDecay
    };
  }
  function applyHybridVelocityCore2(silence = hybridSilence) {
    const mode = getScrollMode2();
    if (mode !== "hybrid") {
      if (state22.mode !== mode) state22.mode = mode;
      assertHybridStoppedIfNotHybrid("applyHybridVelocityCore");
      return;
    }
    if (state22.mode !== "hybrid") state22.mode = "hybrid";
    const candidateBase = Number.isFinite(hybridBasePxps) ? hybridBasePxps : 0;
    const base = candidateBase > 0 ? candidateBase : HYBRID_BASELINE_FLOOR_PXPS;
    const now2 = nowMs();
    const runtime = getHybridBlockRuntimeState();
    const blocksNotReadyHold = isHybridBlocksNotReadyHold(now2, runtime);
    if (blocksNotReadyHold) {
      offScriptEvidence = 0;
      offScriptStreak = 0;
      lastOffScriptEvidenceTs = 0;
      if (hybridSilence.offScriptActive) {
        hybridSilence.offScriptActive = false;
      }
      if (Number.isFinite(hybridScale) && hybridScale !== RECOVERY_SCALE) {
        setHybridScale2(RECOVERY_SCALE);
      }
    }
    const matchState = getHybridMatchState();
    const { bestSim, sawNoMatch, weakMatch: baseWeakMatch, hardNoMatch } = matchState;
    const sawNoMatchEffective = blocksNotReadyHold ? false : sawNoMatch;
    const hardNoMatchEffective = blocksNotReadyHold ? false : hardNoMatch;
    const speechPresent = isHybridSpeechPresent(now2);
    if (speechPresent && hardNoMatchEffective) {
      if (!(hardNoMatchSinceMs > 0)) {
        hardNoMatchSinceMs = now2;
      }
    } else if (hardNoMatchSinceMs > 0) {
      hardNoMatchSinceMs = 0;
    }
    const hardNoMatchAgeMs = hardNoMatchSinceMs > 0 ? Math.max(0, now2 - hardNoMatchSinceMs) : 0;
    const hardNoMatchOffScriptActive = !blocksNotReadyHold && speechPresent && hardNoMatchEffective && hardNoMatchAgeMs >= HYBRID_HARD_NOMATCH_OFFSCRIPT_GRACE_MS;
    const traceClampStage = (stage, inPxps, outPxps, reason2, extra) => {
      if (!Number.isFinite(inPxps) || !Number.isFinite(outPxps)) return;
      const delta = Math.abs(outPxps - inPxps);
      if (delta < 0.01) return;
      const inRounded = Number(inPxps.toFixed(2));
      const outRounded = Number(outPxps.toFixed(2));
      logHybridTrace(
        "clamp_stage",
        {
          stage,
          inPxps: inRounded,
          outPxps: outRounded,
          reason: reason2,
          ...extra
        },
        {
          signature: `${stage}|${inRounded.toFixed(2)}|${outRounded.toFixed(2)}|${reason2}|${typeof extra?.reasonTag === "string" ? extra.reasonTag : ""}`
        }
      );
    };
    const boundMultiplier = (name, rawValue, minValue, maxValue, reasonTag, fallback = 1) => {
      const finiteRaw = Number.isFinite(rawValue) ? rawValue : fallback;
      const bounded = clamp2(finiteRaw, minValue, maxValue);
      if (bounded !== finiteRaw || !Number.isFinite(rawValue)) {
        logHybridTrace(
          "multiplier_cap",
          {
            name,
            inMult: Number.isFinite(rawValue) ? Number(rawValue.toFixed(3)) : null,
            fallback,
            outMult: Number(bounded.toFixed(3)),
            minMult: Number(minValue.toFixed(3)),
            maxMult: Number(maxValue.toFixed(3)),
            reasonTag
          },
          {
            signature: `${name}|${Number.isFinite(rawValue) ? Number(rawValue).toFixed(3) : "nonfinite"}|${bounded.toFixed(3)}|${minValue.toFixed(3)}|${maxValue.toFixed(3)}|${reasonTag}`
          }
        );
      }
      return bounded;
    };
    logHybridTrace(
      "clamp_input",
      {
        basePxps: Number(base.toFixed(2)),
        speechPresent,
        offScriptActive: hybridSilence.offScriptActive || hardNoMatchOffScriptActive,
        hardNoMatch: hardNoMatchEffective,
        sim: Number.isFinite(bestSim ?? NaN) ? Number(bestSim.toFixed(3)) : null,
        blocksNotReadyHold
      },
      {
        throttleMs: 50,
        signature: `${Number(base).toFixed(2)}|${speechPresent ? 1 : 0}|${hybridSilence.offScriptActive || hardNoMatchOffScriptActive ? 1 : 0}|${hardNoMatchEffective ? 1 : 0}|${Number(bestSim ?? NaN).toFixed(3)}|${blocksNotReadyHold ? 1 : 0}`
      }
    );
    if (hardNoMatchOffScriptActive && !hybridSilence.offScriptActive) {
      setHybridScale2(OFFSCRIPT_DEEP);
    }
    const matchSimValue = Number.isFinite(bestSim ?? NaN) && bestSim != null ? bestSim : null;
    const matchKnown = hybridMatchSeen && matchSimValue != null && matchSimValue > 0 && !sawNoMatchEffective;
    const matchReason = matchKnown ? hybridLastMatch?.isFinal ? "asr-final" : "asr" : "unknown";
    if (isDevMode2() && !hybridCtrl.engagedLogged) {
      hybridCtrl.engagedLogged = true;
      try {
        console.info("[HYBRID_CTRL] engaged", {
          hasTargetHint: !!hybridTargetHintState
        });
      } catch {
      }
    }
    const silenceMs = getSilenceMs(now2);
    const errorInfo = computeHybridErrorPx(now2);
    const driftWeakMatch = isHybridDriftWeak(errorInfo);
    const weakMatch = blocksNotReadyHold ? false : baseWeakMatch || driftWeakMatch;
    const eligibility = evaluateHybridEligibility(now2);
    const eligible = eligibility.eligible;
    const eligibleReason = eligibility.reason;
    const normalizedError = eligible && errorInfo ? normalizeHybridError(errorInfo.errorPx) : 0;
    const targetMultFromPx = eligible ? computeTargetMultiplier(normalizedError) : 1;
    const errorLines = Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null ? errorInfo.errorLines : null;
    let effectiveErrorLines = errorLines;
    if (weakMatch) {
      const errorPxValue = Number.isFinite(errorInfo?.errorPx ?? NaN) && errorInfo?.errorPx != null ? errorInfo.errorPx : null;
      if (Number.isFinite(errorPxValue ?? NaN)) {
        const estimatedLines = errorPxValue / HYBRID_CTRL_LINE_PX_DEFAULT;
        const clampedEstimated = Math.max(
          -HYBRID_CTRL_LINE_ERROR_RANGE,
          Math.min(HYBRID_CTRL_LINE_ERROR_RANGE, estimatedLines)
        );
        effectiveErrorLines = Number.isFinite(clampedEstimated) ? clampedEstimated : effectiveErrorLines;
      } else if (effectiveErrorLines == null) {
        effectiveErrorLines = 0;
      }
    }
    const lineTargetMultFromLines = computeLineTargetMultiplier(effectiveErrorLines, eligible);
    let candidateTargetMult = lineTargetMultFromLines;
    let targetMultSource = "none";
    if (candidateTargetMult != null) {
      targetMultSource = "lines";
    } else if (eligible) {
      candidateTargetMult = targetMultFromPx;
      targetMultSource = "px";
    } else {
      candidateTargetMult = 1;
      targetMultSource = "none";
    }
    hybridCtrl.lineTargetMult = Number.isFinite(candidateTargetMult ?? NaN) ? Number(candidateTargetMult) : null;
    hybridCtrl.lineSource = targetMultSource;
    const silenceCap = computeSilenceCapMultiplier(silenceMs);
    const dtMs = hybridCtrl.lastTs > 0 ? Math.max(0, now2 - hybridCtrl.lastTs) : 0;
    const errorLinesRaw = Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null ? errorInfo.errorLines : Number.isFinite(effectiveErrorLines ?? NaN) ? effectiveErrorLines : 0;
    const lineMult = updateHybridLineMult(candidateTargetMult, dtMs, errorLinesRaw > 0);
    let appliedTargetMult = Number.isFinite(lineMult) ? lineMult : 1;
    const offScriptSeverity = blocksNotReadyHold ? 0 : computeOffScriptSeverity();
    const offScriptCap = Math.max(
      HYBRID_CTRL_MIN_MULT,
      1 - offScriptSeverity * HYBRID_CTRL_OFFSCRIPT_PENALTY
    );
    const preSilenceCapMult = appliedTargetMult;
    appliedTargetMult = Math.min(appliedTargetMult, silenceCap);
    traceClampStage(
      "silence_cap",
      base * preSilenceCapMult,
      base * appliedTargetMult,
      "silenceCap",
      { silenceCap: Number(silenceCap.toFixed(3)) }
    );
    const preOffScriptCapMult = appliedTargetMult;
    appliedTargetMult = Math.min(appliedTargetMult, offScriptCap);
    traceClampStage(
      "offscript_cap",
      base * preOffScriptCapMult,
      base * appliedTargetMult,
      "offScriptCap",
      { offScriptCap: Number(offScriptCap.toFixed(3)) }
    );
    const preMinMultClamp = appliedTargetMult;
    appliedTargetMult = Math.max(appliedTargetMult, HYBRID_CTRL_MIN_MULT);
    traceClampStage(
      "min_mult_floor",
      base * preMinMultClamp,
      base * appliedTargetMult,
      "minMultFloor",
      { minMult: Number(HYBRID_CTRL_MIN_MULT.toFixed(3)) }
    );
    hybridCtrl.lastErrorPx = errorInfo?.errorPx ?? 0;
    hybridCtrl.lastAnchorTs = errorInfo?.anchorAgeMs ?? 0;
    hybridCtrl.lastTs = now2;
    const targetMult = candidateTargetMult ?? 1;
    const devOverrideMult = getHybridCtrlDevOverride(now2);
    const ctrlMultFinal = Number.isFinite(devOverrideMult) ? devOverrideMult : appliedTargetMult;
    hybridCtrl.mult = ctrlMultFinal;
    const ctrlMultApplied = boundMultiplier(
      "ctrl_mult",
      ctrlMultFinal,
      HYBRID_CTRL_MIN_MULT,
      HYBRID_CTRL_CTRL_MULT_MAX,
      "ctrlMult"
    );
    const baseWithCorrectionRaw = base * ctrlMultApplied;
    const baseWithCorrection = Number.isFinite(baseWithCorrectionRaw) && baseWithCorrectionRaw > 0 ? baseWithCorrectionRaw : base;
    if (!(Number.isFinite(baseWithCorrectionRaw) && baseWithCorrectionRaw > 0)) {
      logHybridTrace(
        "multiplier_cap",
        {
          name: "base_with_correction",
          inPxps: Number.isFinite(baseWithCorrectionRaw) ? Number(baseWithCorrectionRaw.toFixed(2)) : null,
          outPxps: Number(base.toFixed(2)),
          reasonTag: "baseWithCorrectionFallback"
        },
        {
          signature: `base_with_correction|${Number.isFinite(baseWithCorrectionRaw) ? baseWithCorrectionRaw.toFixed(2) : "nonfinite"}|${base.toFixed(2)}`
        }
      );
    }
    const hybridScaleDetail = computeEffectiveHybridScale(
      now2,
      silence,
      void 0,
      weakMatch || hardNoMatchOffScriptActive,
      effectiveErrorLines,
      weakMatch
    );
    const {
      scale: effectiveScaleRaw,
      reason,
      scaleFromSilence,
      scaleFromOffscript,
      scaleFromGrace,
      graceActive,
      pauseLikely,
      onScriptLocked,
      offScriptActive,
      pausedBySilence,
      offScriptDecay
    } = hybridScaleDetail;
    const aggro = isHybridAggroEnabled();
    const commitBoost = isHybridCommitBoostActive();
    let effectiveScale = effectiveScaleRaw;
    const offScriptScale = hybridSilence.offScriptActive && Number.isFinite(hybridScale) ? clamp2(hybridScale, 0, 1) : 1;
    const offScriptMultiplier = offScriptActive && Number.isFinite(offScriptDecay) ? offScriptScale * offScriptDecay : 1;
    const aggressiveCeiling = aggro || commitBoost;
    const dynamicMaxMult = aggressiveCeiling ? HYBRID_CTRL_DYNAMIC_MAX_MULT_AGGRO : HYBRID_CTRL_DYNAMIC_MAX_MULT;
    const dynamicMaxAbsMinPxps = aggressiveCeiling ? HYBRID_CTRL_DYNAMIC_MAX_ABS_MIN_PXPS_AGGRO : HYBRID_CTRL_DYNAMIC_MAX_ABS_MIN_PXPS;
    const dynamicMaxAllowedPxps = Math.max(baseWithCorrection * dynamicMaxMult, dynamicMaxAbsMinPxps);
    const dynamicMaxScale = dynamicMaxAllowedPxps / Math.max(baseWithCorrection, HYBRID_CTRL_MIN_PXPS);
    const maxScale = Math.max(
      aggro ? HYBRID_CTRL_AGGRO_MAX_MULT : HYBRID_CTRL_BASE_MAX_MULT,
      Number.isFinite(dynamicMaxScale) ? dynamicMaxScale : HYBRID_CTRL_BASE_MAX_MULT
    );
    const confMin = aggro && commitBoost ? 0.35 : 0.65;
    const simMin = aggro && commitBoost ? 0.45 : 0.55;
    const needCatchUp = Number.isFinite(errorLinesRaw) ? errorLinesRaw > 0 : false;
    const conf = Number.isFinite(errorInfo?.confidence ?? NaN) ? errorInfo.confidence : Number.isFinite(hybridTargetHintState?.confidence ?? NaN) ? hybridTargetHintState.confidence : 0;
    const sim = Number.isFinite(bestSim ?? NaN) ? bestSim : 0;
    const eligibleForAggro = needCatchUp && !pausedBySilence && !offScriptActive && reason !== "silence" && reason !== "offscript" && reason !== "grace";
    if ((aggro || commitBoost) && eligibleForAggro) {
      const gatingOk = aggro && commitBoost || conf >= confMin && sim >= simMin;
      if (!gatingOk) {
        const denyReasons = [];
        if (conf < confMin) denyReasons.push("conf");
        if (sim < simMin) denyReasons.push("sim");
        logHybridTrace(
          "catchup_gate_deny",
          {
            denied: true,
            reason: denyReasons.length > 0 ? denyReasons.join("+") : "threshold",
            conf: Number(conf.toFixed(3)),
            confMin: Number(confMin.toFixed(3)),
            sim: Number(sim.toFixed(3)),
            simMin: Number(simMin.toFixed(3)),
            needCatchUp,
            aggro,
            commitBoost,
            errorLines: Number(errorLinesRaw.toFixed(3))
          },
          {
            throttleMs: 80,
            signature: `${denyReasons.join("+")}|${conf.toFixed(3)}|${sim.toFixed(3)}|${needCatchUp ? 1 : 0}|${aggro ? 1 : 0}|${commitBoost ? 1 : 0}`
          }
        );
      }
      if (gatingOk) {
        const errBoost = clamp2(Math.abs(errorLinesRaw) / 6, 0, 1);
        const distanceScale = 1 + errBoost * (maxScale - 1);
        effectiveScale = Math.min(maxScale, Math.max(effectiveScale, distanceScale));
        if (isDevMode2()) {
          try {
            console.warn("[HYBRID_TRUTH]", {
              aggro,
              commitBoost,
              needCatchUp,
              errorLines: Math.round(errorLinesRaw * 10) / 10,
              conf: Math.round(conf * 100) / 100,
              sim: Math.round(sim * 100) / 100,
              distanceScale: Math.round(distanceScale * 100) / 100,
              effectiveScale: Math.round(effectiveScale * 100) / 100,
              basePxps: Math.round(base * 10) / 10,
              writerSource: getLastWriterSource()
            });
          } catch {
          }
        }
      }
    }
    const pauseTailEligible = pauseLikely && silence.pausedBySilence;
    if (pauseTailEligible && hybridAssistState.boostPxps > 0) {
      pauseAssistTailBoost = hybridAssistState.boostPxps;
      pauseAssistTailUntil = Math.max(pauseAssistTailUntil, now2 + PAUSE_ASSIST_TAIL_MS);
    } else if (!pauseTailEligible) {
      pauseAssistTailBoost = 0;
      pauseAssistTailUntil = 0;
    }
    logHybridScaleDetail({
      basePxps: base,
      scaleFromSilence,
      scaleFromOffscript,
      scaleFromGrace,
      graceActive,
      chosenScale: effectiveScale,
      reason,
      pauseLikely,
      onScriptLocked,
      offScriptActive,
      pausedBySilence
    });
    const brakeActive = hybridBrakeState.expiresAt > now2;
    const brakeTtl = Math.max(0, hybridBrakeState.expiresAt - now2);
    const assistActive = hybridAssistState.expiresAt > now2;
    const assistTtl = Math.max(0, hybridAssistState.expiresAt - now2);
    const brakeRaw = getActiveBrakeFactor(now2);
    const brakeFactor = graceActive ? 1 : brakeRaw;
    const motorRunning = hybridMotor.isRunning();
    logHybridBrakeEvent({
      now: now2,
      brakeRaw,
      brakeFactor,
      graceActive,
      brakeExpiresAt: hybridBrakeState.expiresAt,
      brakeReason: hybridBrakeState.reason,
      brakeActive,
      brakeTtl,
      motorRunning
    });
    const rawAssist = getActiveAssistBoost(now2, pauseTailEligible);
    const suppressAssist = reason === "silence" || effectiveScale <= OFFSCRIPT_SCALE || reason === "grace";
    const assistCap = Math.max(0, base * HYBRID_ASSIST_CAP_FRAC);
    const assistBoost = suppressAssist ? 0 : Math.min(rawAssist, assistCap);
    const deltaLines = Number.isFinite(errorLinesRaw) ? errorLinesRaw : 0;
    const absDL = Math.abs(deltaLines);
    const deadbandLines = aggro ? 0.45 : 0.75;
    const kDown = aggro ? 0.26 : 0.14;
    let reactiveScale = 1;
    const reasons = [];
    if (absDL > deadbandLines) {
      if (deltaLines > 0) {
        const baseGain = deltaLines * HYBRID_REACTIVE_BEHIND_BASE;
        const bonusGain = Math.max(0, deltaLines - HYBRID_REACTIVE_BEHIND_ACC_THRESHOLD) * HYBRID_REACTIVE_BEHIND_ACC_BONUS;
        reactiveScale = 1 + baseGain + bonusGain;
      } else {
        const raw = 1 - kDown * (absDL - deadbandLines);
        const minReactive = aggro ? 0.5 : 0.65;
        const maxReactive = aggro ? 1.9 : 1.45;
        reactiveScale = clamp2(raw, minReactive, maxReactive);
      }
      reasons.push(deltaLines > 0 ? "behind" : "ahead");
    } else {
      reasons.push("deadband");
    }
    const reactiveScaleCap = Math.min(
      HYBRID_CTRL_REACTIVE_MULT_MAX,
      Math.max(HYBRID_CTRL_POLICY_MULT_MIN, maxScale)
    );
    reactiveScale = boundMultiplier(
      "reactive_scale",
      reactiveScale,
      HYBRID_CTRL_POLICY_MULT_MIN,
      reactiveScaleCap,
      "reactiveScale"
    );
    let policyMult = 1;
    if (pausedBySilence || reason === "silence") {
      const inScale = reactiveScale * policyMult;
      const silenceMult = aggro ? 0.75 : 0.85;
      policyMult *= silenceMult;
      const outScale = reactiveScale * policyMult;
      traceClampStage(
        "silence_policy",
        baseWithCorrection * inScale,
        baseWithCorrection * outScale,
        "silencePolicy",
        { silenceMult: Number(silenceMult.toFixed(3)) }
      );
      reasons.push("silence");
    }
    if (offScriptActive || reason === "offscript") {
      const inScale = reactiveScale * policyMult;
      const offscriptMult = aggro ? 0.8 : 0.9;
      policyMult *= offscriptMult;
      const outScale = reactiveScale * policyMult;
      traceClampStage(
        "offscript_policy",
        baseWithCorrection * inScale,
        baseWithCorrection * outScale,
        "offScriptPolicy",
        { offscriptMult: Number(offscriptMult.toFixed(3)) }
      );
      reasons.push("offscript");
    }
    policyMult = boundMultiplier(
      "policy_mult",
      policyMult,
      HYBRID_CTRL_POLICY_MULT_MIN,
      HYBRID_CTRL_POLICY_MULT_MAX,
      "policyMult"
    );
    const preClampScale = boundMultiplier(
      "preclamp_scale",
      reactiveScale * policyMult,
      HYBRID_CTRL_POLICY_MULT_MIN,
      HYBRID_CTRL_PRECLAMP_SCALE_MAX,
      "preClampScale"
    );
    let scaleAfterBrake = preClampScale;
    if (brakeActive) {
      const beforeBrake = scaleAfterBrake;
      scaleAfterBrake = Math.min(scaleAfterBrake, brakeFactor);
      traceClampStage(
        "brake_clamp",
        baseWithCorrection * beforeBrake,
        baseWithCorrection * scaleAfterBrake,
        "brakeCap",
        { brakeFactor: Number(brakeFactor.toFixed(3)) }
      );
      reasons.push("brakeCap");
    }
    let scaleAfterCaps = scaleAfterBrake;
    const assistFloorScale = boundMultiplier(
      "assist_floor_scale",
      suppressAssistScale(rawAssist, baseWithCorrection),
      0,
      2.5,
      "assistFloor",
      0
    );
    const assistEligible = assistActive && assistFloorScale > 0 && needCatchUp && conf >= confMin;
    if (assistEligible) {
      const beforeAssistFloor = scaleAfterCaps;
      scaleAfterCaps = Math.max(scaleAfterCaps, assistFloorScale);
      traceClampStage(
        "assist_floor",
        baseWithCorrection * beforeAssistFloor,
        baseWithCorrection * scaleAfterCaps,
        "assistFloor",
        { assistFloorScale: Number(assistFloorScale.toFixed(3)) }
      );
      reasons.push("assistFloor");
    }
    scaleAfterCaps = boundMultiplier(
      "scale_after_caps",
      scaleAfterCaps,
      HYBRID_CTRL_POLICY_MULT_MIN,
      HYBRID_CTRL_PRECLAMP_SCALE_MAX,
      "scaleAfterCaps"
    );
    const minScale = HYBRID_CTRL_MIN_MULT;
    const maxClampScale = Math.max(maxScale, minScale);
    const isBehind = deltaLines > 0;
    const clampOverride = isBehind || assistEligible;
    const scaleLimitedToMax = Math.min(scaleAfterCaps, maxClampScale);
    let finalScale = scaleLimitedToMax;
    let clampReason = null;
    if (scaleAfterCaps > maxClampScale) {
      finalScale = maxClampScale;
      clampReason = "maxClamp";
      const inPxps = baseWithCorrection * scaleAfterCaps;
      const maxAllowedPxps = baseWithCorrection * maxClampScale;
      const outPxps = baseWithCorrection * finalScale;
      let maxClampReasonTag = "maxClamp";
      if (assistEligible && scaleAfterCaps > scaleAfterBrake + 1e-3) {
        maxClampReasonTag = "assistFloor";
      } else if (reactiveScale >= HYBRID_CTRL_REACTIVE_MULT_MAX - 1e-3) {
        maxClampReasonTag = "reactiveScaleCap";
      } else if (policyMult >= HYBRID_CTRL_POLICY_MULT_MAX - 1e-3) {
        maxClampReasonTag = "policyMultCap";
      } else if (ctrlMultApplied >= HYBRID_CTRL_CTRL_MULT_MAX - 1e-3) {
        maxClampReasonTag = "ctrlMultCap";
      } else if (Math.abs(maxAllowedPxps - dynamicMaxAbsMinPxps) <= 0.5) {
        maxClampReasonTag = "dynamicAbsMinCeiling";
      } else if (dynamicMaxAllowedPxps >= baseWithCorrection * dynamicMaxMult - 0.5) {
        maxClampReasonTag = "dynamicMultCeiling";
      }
      traceClampStage(
        "max_clamp",
        inPxps,
        outPxps,
        "maxClamp",
        {
          maxClampScale: Number(maxClampScale.toFixed(3)),
          maxAllowedPxps: Number(maxAllowedPxps.toFixed(2)),
          inScale: Number(scaleAfterCaps.toFixed(3)),
          reasonTag: maxClampReasonTag
        }
      );
    } else if (!clampOverride && scaleLimitedToMax < minScale) {
      finalScale = minScale;
      clampReason = "minClamp";
      traceClampStage(
        "min_clamp",
        baseWithCorrection * scaleLimitedToMax,
        baseWithCorrection * finalScale,
        "minClamp",
        { minScale: Number(minScale.toFixed(3)) }
      );
    }
    if (clampReason) {
      reasons.push(clampReason);
    }
    const errorPx = Number.isFinite(errorInfo?.errorPx ?? NaN) && errorInfo?.errorPx != null ? errorInfo.errorPx : null;
    const distancePx = errorPx != null ? Math.abs(errorPx) : null;
    const stableOnTarget = distancePx != null && distancePx <= HYBRID_CTRL_ON_TARGET_STABLE_PX && Math.abs(deltaLines) <= HYBRID_CTRL_MODE_DEADBAND_LINES;
    if (stableOnTarget) {
      const preStableClampScale = finalScale;
      finalScale = clamp2(finalScale, HYBRID_CTRL_ON_TARGET_MULT_MIN, HYBRID_CTRL_ON_TARGET_MULT_MAX);
      traceClampStage(
        "on_target_clamp",
        baseWithCorrection * preStableClampScale,
        baseWithCorrection * finalScale,
        "stableOnTarget",
        {
          min: Number(HYBRID_CTRL_ON_TARGET_MULT_MIN.toFixed(3)),
          max: Number(HYBRID_CTRL_ON_TARGET_MULT_MAX.toFixed(3))
        }
      );
    }
    if (offScriptMultiplier !== 1) {
      const preOffScriptDecayScale = finalScale;
      finalScale *= offScriptMultiplier;
      traceClampStage(
        "offscript_decay",
        baseWithCorrection * preOffScriptDecayScale,
        baseWithCorrection * finalScale,
        "offScriptDecay",
        { offScriptMultiplier: Number(offScriptMultiplier.toFixed(3)) }
      );
      reasons.push("offscriptDecay");
    }
    const minPxps = offScriptMultiplier < 1 ? speechPresent ? HYBRID_CTRL_MIN_PXPS * HYBRID_OFFSCRIPT_SPEECH_FLOOR_MULT : 0 : HYBRID_CTRL_MIN_PXPS;
    const unclampedPxpsBase = baseWithCorrection * finalScale;
    const finalPxpsBase = Math.max(minPxps, unclampedPxpsBase);
    traceClampStage(
      "min_pxps_floor",
      unclampedPxpsBase,
      finalPxpsBase,
      speechPresent ? "speechFloor" : "minPxps",
      { minPxps: Number(minPxps.toFixed(2)) }
    );
    const assistFloorBoostPx = assistEligible && isBehind ? base * HYBRID_CTRL_ASSIST_BEHIND_BOOST_FRAC : 0;
    const finalPxps = finalPxpsBase + assistFloorBoostPx * offScriptMultiplier;
    const velocityPxps = Number.isFinite(finalPxps) ? Math.abs(finalPxps) : 0;
    const targetTopSourceRaw = errorInfo?.targetTopSource ?? null;
    const targetTopAnchor = targetTopSourceRaw === "anchor";
    const provisionalAnchor = matchKnown && targetTopAnchor;
    const nearError = distancePx != null && distancePx <= HYBRID_ON_TARGET_PX;
    const nearLines = Math.abs(deltaLines) <= HYBRID_ON_TARGET_LINES;
    const forceOnTarget = provisionalAnchor && nearError && nearLines && matchKnown && velocityPxps <= HYBRID_CTRL_ON_TARGET_VELOCITY_EPS && brakeTtl > 0;
    const hintedErrorLines = Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null ? errorInfo.errorLines : null;
    let modeHint = computeHybridModeHint(forceOnTarget ? 0 : hintedErrorLines, weakMatch);
    if (!matchKnown && (brakeActive || hybridSilence.pausedBySilence)) {
      modeHint = "LETTING YOU CATCH UP";
    }
    const finalReasons = reasons.length > 0 ? reasons : ["base"];
    const capReason = finalReasons.includes("silence") ? "silence" : finalReasons.includes("offscript") ? "offscript" : void 0;
    if (isDevMode2() && now2 - lastHybridPolicyLogAt >= HYBRID_POLICY_LOG_THROTTLE_MS) {
      lastHybridPolicyLogAt = now2;
      const speedSettingRaw = getHybridSpeedSettingRaw();
      try {
        console.info("[HYBRID_POLICY]", {
          speechPresent,
          speechHoldRemainingMs: Math.round(getHybridSpeechHoldRemainingMs(now2)),
          hardNoMatch: hardNoMatchEffective,
          hardNoMatchAgeMs: Math.round(hardNoMatchAgeMs),
          offScriptActive: offScriptActive || hardNoMatchOffScriptActive,
          policyMult: Number(policyMult.toFixed(3)),
          basePxps: Number(base.toFixed(2)),
          finalPxps: Number(finalPxps.toFixed(2)),
          speedSettingRaw,
          speedUnit: "wpm"
        });
      } catch {
      }
    }
    logHybridMultDebug({
      basePxps: base,
      errorLines: errorInfo?.errorLines ?? null,
      targetMult: Number.isFinite(candidateTargetMult ?? NaN) ? Number(candidateTargetMult) : 1,
      lineMult: appliedTargetMult,
      finalPxps,
      capReason: finalReasons.join(",")
    });
    logHybridCtrlState(
      base,
      baseWithCorrection,
      now2,
      errorInfo,
      silenceMs,
      eligible,
      eligibleReason,
      normalizedError,
      targetMult,
      targetMultSource,
      hybridCtrl.lineTargetMult,
      hybridCtrl.lineMult,
      appliedTargetMult,
      silenceCap,
      offScriptSeverity,
      offScriptCap,
      finalPxps,
      ctrlMultApplied,
      finalScale,
      modeHint
    );
    renderHybridCtrlHud({
      basePxps: base,
      baseWithCorrection,
      errorPx: errorInfo?.errorPx ?? null,
      anchorAgeMs: errorInfo?.anchorAgeMs ?? null,
      normalizedError,
      targetMult,
      appliedTargetMult,
      mult: hybridCtrl.mult,
      silenceMs,
      silenceCap,
      offScriptSeverity,
      offScriptCap,
      eligible,
      targetTop: errorInfo?.targetScrollTop ?? null,
      currentTop: errorInfo?.currentScrollTop ?? null,
      modeHint,
      ctrlMultApplied,
      effectiveScaleApplied: finalScale,
      finalPxps,
      eligibleReason,
      errorLines: errorInfo?.errorLines ?? null,
      markerIdx: errorInfo?.markerIdx ?? null,
      bestIdx: errorInfo?.bestIdx ?? null,
      targetMultSource,
      lineTargetMult: hybridCtrl.lineTargetMult,
      lineMult: hybridCtrl.lineMult,
      lineSource: targetMultSource,
      writerSource: getLastWriterSource()
    });
    const effectiveScaleApplied = finalScale;
    const effective = baseWithCorrection * effectiveScaleApplied;
    logHybridVelocityEvent({
      basePxps: base,
      chosenScale: finalScale,
      brakeFactor,
      effective,
      rawAssist,
      assistCap,
      assistBoost,
      suppressAssist,
      velocity: finalPxps,
      reason,
      brakeActive,
      brakeTtl,
      assistActive,
      assistTtl,
      graceActive,
      motorRunning
    });
    logHybridTruthLine({
      basePxps: base,
      finalPxps,
      errorPx: errorInfo?.errorPx,
      errorLines: errorInfo?.errorLines ?? null,
      effectiveErrorLines,
      targetMult,
      lineMult,
      capReason,
      scaleReason: hybridScaleDetail.reason,
      noMatch: sawNoMatchEffective || !matchKnown,
      sawNoMatch: sawNoMatchEffective,
      hardNoMatch: hardNoMatchEffective,
      offScriptActive: hybridScaleDetail.offScriptActive,
      bestSim,
      weakMatch,
      driftWeak: driftWeakMatch,
      targetTopSource: errorInfo?.targetTopSource ?? null
    });
    const wantedPxps = Number.isFinite(base) ? base * finalScale : finalScale;
    const sentPxps = finalPxps;
    const clampStage = finalReasons.includes("maxClamp") ? "postScaleMaxClamp" : finalReasons.includes("minClamp") ? "postScaleMinClamp" : finalReasons.includes("brakeCap") ? "motorBrakeClamp" : finalReasons.includes("assistFloor") ? "assistFloorClamp" : "unknown_post_final_mile";
    if (isDevMode2()) {
      try {
        const logParts = [
          `basePxps=${base.toFixed(2)}`,
          `deltaLines=${deltaLines.toFixed(2)}`,
          `errorPx=${errorPx?.toFixed(1) ?? "null"}`,
          `reactiveScale=${reactiveScale.toFixed(3)}`,
          `policyMult=${policyMult.toFixed(3)}`,
          `preClampScale=${preClampScale.toFixed(3)}`,
          `scaleAfterCaps=${scaleAfterCaps.toFixed(3)}`,
          `capMax=${maxClampScale.toFixed(3)}`,
          `floorMin=${minScale.toFixed(3)}`,
          `finalScale=${finalScale.toFixed(3)}`,
          `finalPxps=${finalPxps.toFixed(2)}`,
          `reasons=${finalReasons.join("|")}`
        ];
        console.info("[HYBRID_FINAL_MILE]", logParts.join(" "));
        const matchSimLog = matchKnown ? matchSimValue : null;
        const stateParts = [
          `noMatch=${sawNoMatchEffective || !matchKnown}`,
          `sawNoMatch=${sawNoMatchEffective}`,
          `weakMatch=${weakMatch}`,
          `hardNoMatch=${hardNoMatchEffective}`,
          `offScriptActive=${offScriptActive}`,
          `reason=${reason}`,
          `conf=${conf.toFixed(2)}`,
          `sim=${sim.toFixed(2)}`,
          `matchSim=${matchSimLog != null ? matchSimLog.toFixed(2) : "null"}`,
          `matchReason=${matchReason}`,
          `targetTopSrc=${matchKnown ? errorInfo?.targetTopSource ?? "unknown" : "unknown"}`,
          `blocksReady=${runtime.blocksReady}`,
          `blockCount=${runtime.blockCount}`,
          `blockSource=${runtime.blockSource}`,
          `backendReady=${runtime.backendReady}`,
          `blocksHold=${blocksNotReadyHold}`,
          `scriptHash=${runtime.scriptHash ?? "null"}`,
          `scriptSig=${runtime.scriptSig ?? "null"}`,
          `matcherSource=${runtime.matcherSource}`,
          `matcherFeed=${runtime.matcherSourceDetail}`
        ];
        console.info("[HYBRID_FINAL_MILE_STATE]", stateParts.join(" "));
        if (blocksNotReadyHold || sawNoMatchEffective || offScriptActive || hardNoMatchEffective) {
          logHybridMatcherProbe("final-mile", {
            noMatch: sawNoMatchEffective || !matchKnown,
            sawNoMatch: sawNoMatchEffective,
            weakMatch,
            hardNoMatch: hardNoMatchEffective,
            hardNoMatchAgeMs: Math.round(hardNoMatchAgeMs),
            hardNoMatchOffScriptActive,
            offScriptActive,
            bestSim: matchSimLog,
            reason,
            blocksReady: runtime.blocksReady,
            blockCount: runtime.blockCount,
            blockSource: runtime.blockSource,
            scriptHash: runtime.scriptHash,
            scriptSig: runtime.scriptSig,
            matcherSource: runtime.matcherSource,
            matcherSourceDetail: runtime.matcherSourceDetail,
            backendReady: runtime.backendReady,
            blocksNotReadyHold
          });
        }
      } catch {
      }
    }
    if (wantedPxps !== sentPxps) {
      const clampPayload = {
        stage: clampStage,
        basePxps: base,
        finalScale,
        wantedPxps,
        finalPxps: sentPxps,
        deltaLines,
        reasons: finalReasons,
        capMax: maxClampScale,
        capMin: minScale
      };
      try {
        console.warn("[HYBRID_POST_CLAMP]", JSON.stringify(clampPayload));
      } catch {
      }
    }
    logHybridTrace(
      "motor_velocity_set",
      {
        finalPxps: Number(finalPxps.toFixed(2)),
        basePxps: Number(base.toFixed(2)),
        finalScale: Number(finalScale.toFixed(3)),
        speechPresent,
        offScriptActive: offScriptActive || hardNoMatchOffScriptActive,
        reason: finalReasons.join("|")
      },
      {
        throttleMs: 30,
        signature: `${finalPxps.toFixed(2)}|${base.toFixed(2)}|${finalScale.toFixed(3)}|${speechPresent ? 1 : 0}|${offScriptActive || hardNoMatchOffScriptActive ? 1 : 0}|${finalReasons.join("|")}`
      }
    );
    hybridMotor.setVelocityPxPerSec(finalPxps);
    emitHybridSafety();
    scheduleHybridVelocityRefresh();
  }
  try {
    const target = typeof window !== "undefined" ? window : globalThis;
    target.__tpApplyHybridVelocity = applyHybridVelocityCore2;
  } catch {
  }
  function suppressAssistScale(boost, base) {
    if (!Number.isFinite(boost) || boost <= 0) return 0;
    if (!Number.isFinite(base) || base <= 0) return 0;
    const scale = 1 + boost / Math.max(base, HYBRID_CTRL_MIN_PXPS);
    return clamp2(scale, 1, 2);
  }
  function emitHybridSafety() {
    try {
      const payload = {
        pausedBySilence: hybridSilence.pausedBySilence,
        offScriptStreak,
        onScriptStreak,
        scale: hybridScale,
        lastSpeechAtMs: hybridSilence.lastSpeechAtMs,
        targetHint: hybridTargetHintState ?? void 0,
        hybridSilenceStamp: hybridSilence2
      };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tp:hybridSafety", { detail: payload }));
      }
    } catch {
    }
  }
  function resetHybridSafetyState() {
    offScriptStreak = 0;
    onScriptStreak = 0;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    setHybridScale2(RECOVERY_SCALE);
    cancelHybridVelocityRefresh();
    emitHybridSafety();
  }
  const AUTO_MIN = 1;
  const AUTO_MAX = 60;
  const AUTO_STEP_FINE = 1;
  const AUTO_STEP_COARSE = 5;
  const getStoredSpeed = () => {
    try {
      const raw = localStorage.getItem("tp_auto_speed");
      const v = raw != null ? parseFloat(raw) : NaN;
      if (!Number.isFinite(v)) return 21;
      return Math.min(AUTO_MAX, Math.max(AUTO_MIN, v));
    } catch {
      return 21;
    }
  };
  const getCurrentSpeed = () => {
    try {
      const fromApi = auto?.getState?.().speed;
      if (typeof fromApi === "number" && Number.isFinite(fromApi)) {
        return Math.min(AUTO_MAX, Math.max(AUTO_MIN, fromApi));
      }
    } catch {
    }
    return getStoredSpeed();
  };
  const setSpeed = (next) => {
    const clamped = Math.min(AUTO_MAX, Math.max(AUTO_MIN, Number(next) || 0));
    try {
      auto?.setSpeed?.(clamped);
    } catch {
    }
    try {
      localStorage.setItem("tp_auto_speed", String(clamped));
    } catch {
    }
    return clamped;
  };
  const nudgeSpeed = (delta) => setSpeed(getCurrentSpeed() + delta);
  setSpeed(getStoredSpeed());
  function getStoredBaselineWpmPx() {
    try {
      const stored = localStorage.getItem("tp_baseline_wpm");
      const wpm = stored ? parseFloat(stored) : NaN;
      if (Number.isFinite(wpm) && wpm > 0) {
        const px = convertWpmToPxPerSec(wpm);
        if (px > 0) return px;
      }
    } catch {
    }
    return null;
  }
  function getSliderBaselinePx() {
    try {
      const sliderInput = document.getElementById("wpmTarget");
      const sliderVal = sliderInput ? Number(sliderInput.value) : NaN;
      if (Number.isFinite(sliderVal) && sliderVal > 0) {
        const px = convertWpmToPxPerSec(sliderVal);
        if (px > 0) return px;
      }
    } catch {
    }
    return null;
  }
  function getLastKnownAutoSpeed() {
    try {
      let pxFromAuto;
      if (typeof auto?.getState === "function") {
        pxFromAuto = auto.getState()?.speed;
      }
      const px = Number(pxFromAuto ?? getStoredSpeed());
      if (Number.isFinite(px) && px > 0) return px;
    } catch {
    }
    return null;
  }
  function resolveHybridSeedPx() {
    const slider = getSliderBaselinePx();
    if (slider && Number.isFinite(slider) && slider > 0) {
      sliderTouchedThisSession = true;
      return slider;
    }
    const stored = getStoredBaselineWpmPx();
    if (stored && Number.isFinite(stored) && stored > 0) {
      return stored;
    }
    if (!sliderTouchedThisSession) {
      const auto2 = getLastKnownAutoSpeed();
      if (auto2 && Number.isFinite(auto2) && auto2 > 0) {
        return auto2;
      }
    }
    return HYBRID_BASELINE_FLOOR_PXPS;
  }
  function resolveAutoPxPerSec(candidate) {
    let px = Number(candidate ?? NaN);
    if (!Number.isFinite(px) || px <= 0) {
      px = resolveHybridSeedPx();
    }
    if (!Number.isFinite(px) || px <= 0) {
      px = HYBRID_BASELINE_FLOOR_PXPS;
    }
    return px;
  }
  function logHybridBaselineState(source) {
    if (!isDevMode2()) return;
    try {
      const base = Number.isFinite(hybridBasePxps) ? hybridBasePxps : 0;
      const scale = Number.isFinite(hybridScale) ? hybridScale : 0;
      const effective = base * scale;
      const fmt = (value) => Number.isFinite(value) ? value.toFixed(1) : "0.0";
      console.info(`[HYBRID] baseline=${fmt(base)} scale=${fmt(scale)} effective=${fmt(effective)} source=${source}`);
    } catch {
    }
  }
  function setHybridBasePxps(nextPxps) {
    const candidate = Number.isFinite(nextPxps) && nextPxps > 0 ? nextPxps : HYBRID_BASELINE_FLOOR_PXPS;
    if (hybridBasePxps === candidate) return candidate;
    const prev = hybridBasePxps;
    hybridBasePxps = candidate;
    if (isDevMode2()) {
      try {
        const fmt = (value) => Number.isFinite(value) ? value.toFixed(1) : "0.0";
        console.info(`[HYBRID] baseline updated from WPM: ${fmt(prev)} \u2192 ${fmt(candidate)}`);
      } catch {
      }
    }
    runHybridVelocity(hybridSilence);
    return candidate;
  }
  function seedHybridBaseSpeed2() {
    const base = resolveHybridSeedPx();
    setHybridBasePxps(base);
    return hybridBasePxps;
  }
  try {
    if (typeof window !== "undefined") {
      const w2 = window;
      if (!w2.__scrollCtl) w2.__scrollCtl = {};
      w2.__scrollCtl.setSpeed = (next) => {
        try {
          setSpeed(next);
        } catch {
        }
      };
      w2.__scrollCtl.stopAutoCatchup = () => {
        try {
          auto?.stop?.();
        } catch {
        }
      };
    }
  } catch {
  }
  try {
    window.addEventListener("tp:autoSpeed", (ev) => {
      try {
        const detail = ev?.detail || {};
        const raw = detail.pxPerSec ?? detail.px ?? detail.speed ?? detail.value;
        const pxs = Number(raw);
        if (!Number.isFinite(pxs) || pxs <= 0) return;
        if (state22.mode === "hybrid") {
          applyWpmBaselinePx(pxs, "autoSpeed");
        } else {
          setSpeed(pxs);
        }
      } catch {
      }
    });
  } catch {
  }
  let applyGateRaf = null;
  const MOTOR_IGNORED_LOG_THROTTLE_MS = 2e3;
  let lastMotorIgnoredLogAt = 0;
  let lastMotorIgnoredLogKey = "";
  function logAutoGateAction(action, mode, line, blockedReason = "") {
    if (mode === "asr" && blockedReason === "blocked:mode-asr-motorless") {
      return;
    }
    if (action !== "MOTOR_IGNORED_OFF") {
      try {
        console.info(line);
      } catch {
      }
      return;
    }
    const now2 = Date.now();
    const dedupeKey = `${mode}|${blockedReason}`;
    if (dedupeKey === lastMotorIgnoredLogKey && now2 - lastMotorIgnoredLogAt < MOTOR_IGNORED_LOG_THROTTLE_MS) {
      return;
    }
    lastMotorIgnoredLogKey = dedupeKey;
    lastMotorIgnoredLogAt = now2;
    try {
      console.debug(line);
    } catch {
    }
  }
  function scheduleApplyGate() {
    if (applyGateRaf != null) return;
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      try {
        applyGate();
      } catch {
      }
      return;
    }
    applyGateRaf = window.requestAnimationFrame(() => {
      applyGateRaf = null;
      try {
        applyGate();
      } catch {
      }
    });
  }
  function applyGate() {
    try {
      const mode = getScrollMode2();
      if (mode !== "hybrid") {
        assertHybridStoppedIfNotHybrid("applyGate");
        if (silenceTimer) {
          try {
            clearTimeout(silenceTimer);
          } catch {
          }
          silenceTimer = void 0;
        }
        if (hybridMotor.isRunning()) {
          hybridMotor.stop();
          clearActiveMotor("hybrid");
          emitMotorState2("hybridWpm", false);
        }
        clearHybridSilenceTimer();
        resetHybridSafetyState();
        const requestedAutoPx = getLastKnownAutoSpeed();
        const autoPxPerSec = resolveAutoPxPerSec(requestedAutoPx);
        if (isDevMode2() && (!Number.isFinite(requestedAutoPx ?? NaN) || (requestedAutoPx ?? 0) <= 0)) {
          try {
            console.warn("[AUTO] fallback to default px/sec", {
              requestedAutoPx,
              autoPxPerSec
            });
          } catch {
          }
        }
        const viewerReady = hasScrollableTarget();
        const requestedMotorKind = lastAutoIntentMotorRequest.kind;
        const requestedMotorSource = lastAutoIntentMotorRequest.source;
        const livePhase = sessionPhase2 === "live";
        const sessionBlocked = !sessionIntentOn && !userEnabled;
        let autoBlocked = "blocked:sessionOff";
        if (mode === "step" || mode === "rehearsal") {
          autoBlocked = `blocked:mode-${mode}`;
        } else if (mode === "asr") {
          autoBlocked = "blocked:mode-asr-motorless";
        } else if (!livePhase) {
          autoBlocked = "blocked:livePhase";
        } else if (sessionBlocked) {
          autoBlocked = "blocked:sessionOff";
        } else if (!userEnabled) {
          autoBlocked = "blocked:userIntentOff";
        } else if (!viewerReady) {
          autoBlocked = "blocked:noScrollTarget";
        } else if (!Number.isFinite(autoPxPerSec) || autoPxPerSec <= 0) {
          autoBlocked = "blocked:pxZero";
        } else {
          autoBlocked = "none";
        }
        const want = autoBlocked === "none";
        const prevEnabled = (enabledNow || !!auto?.getState?.().enabled) && activeMotorBrain === "auto";
        const prevRunning = !!auto?.isRunning?.();
        const action = want ? prevRunning ? "MOTOR_ALREADY_RUNNING" : "MOTOR_START" : prevEnabled ? "MOTOR_STOP" : "MOTOR_IGNORED_OFF";
        logAutoGateAction(
          action,
          mode,
          `[scroll-router] ${action} mode=${mode} reqKind=${requestedMotorKind} reqSource=${requestedMotorSource} sessionPhase=${sessionPhase2} sessionIntent=${sessionIntentOn} pxPerSec=${autoPxPerSec} blocked=${autoBlocked}`,
          autoBlocked
        );
        let emittedAutoStop = false;
        if (want) {
          try {
            auto.setSpeed?.(autoPxPerSec);
          } catch {
          }
          try {
            auto.start?.();
          } catch {
          }
          try {
            auto.setEnabled?.(true);
          } catch {
          }
          enabledNow = true;
          setActiveMotor("auto", mode);
        } else {
          emittedAutoStop = stopAutoMotor(mode === "asr" ? "enter-asr" : autoBlocked);
        }
        const detail2 = `Mode: ${mode} \u2022 Session:${sessionPhase2} \u2022 Intent:${sessionIntentOn ? "on" : "off"} \u2022 User:${userEnabled ? "On" : "Off"}`;
        setAutoChip(userEnabled ? enabledNow ? "on" : "paused" : "manual", detail2);
        if (!emittedAutoStop) {
          emitMotorState2("auto", enabledNow);
        }
        try {
          emitAutoState();
        } catch {
        }
        lastHybridGateFingerprint = null;
        return;
      }
      const computeGateWanted = () => {
        switch (gatePref) {
          case "db":
            return dbGate;
          case "vad":
            return vadGate;
          case "db_and_vad":
            return dbGate && vadGate;
          case "db_or_vad":
          default:
            return dbGate || vadGate;
        }
      };
      if (enabledNow) {
        stopAutoMotor("hybrid-gate");
      }
      const now2 = nowMs();
      const gateWanted = computeGateWanted();
      const phaseAllowed = canRunHybridMotor();
      const runtime = getHybridBlockRuntimeState();
      const baseHybridPxPerSec = Number.isFinite(hybridBasePxps) ? Math.max(0, hybridBasePxps) : 0;
      const lastSpeechAgeMs = Math.max(0, now2 - hybridSilence.lastSpeechAtMs);
      const speechPresent = isHybridSpeechPresent(now2);
      const speechHoldRemainingMs = getHybridSpeechHoldRemainingMs(now2);
      const speechHeardRecently = speechPresent || lastSpeechAgeMs <= HYBRID_BLOCKS_NOT_READY_HOLD_MS;
      const blocksNotReadyHold = runtime.backendReady && !runtime.blocksReady && speechHeardRecently;
      const liveGraceActive = isLiveGraceActive(now2);
      const errorInfo = computeHybridErrorPx(now2);
      const silenceStopMs = computeHybridSilenceDelayMs();
      const isSilent = !liveGraceActive && lastSpeechAgeMs >= silenceStopMs;
      const speechAllowed = !isSilent || blocksNotReadyHold;
      const gateSatisfied = isHybridBypass() ? true : gateWanted;
      const wantEnabled = hybridWantedRunning && userEnabled && phaseAllowed && (speechAllowed || gateSatisfied);
      let hybridBlockedReason = "none";
      if (!userEnabled) {
        hybridBlockedReason = "blocked:userOff";
      } else if (!phaseAllowed) {
        hybridBlockedReason = "blocked:livePhase";
      } else if (!speechAllowed && !gateSatisfied) {
        hybridBlockedReason = "blocked:hybridGate";
      }
      const silencePaused = hybridSilence.pausedBySilence || isSilent;
      hybridSilence.pausedBySilence = silencePaused;
      if (silencePaused) {
        hybridBlockedReason = "blocked:silence";
      }
      const hybridRunning = hybridMotor.isRunning();
      const silenceSnapshot = hybridSilence?.getState?.() ?? hybridSilence ?? null;
      const safeSilence = silenceSnapshot ?? {
        lastSpeechAtMs: now2,
        pausedBySilence: false,
        timeoutId: null,
        erroredOnce: false,
        offScriptActive: false
      };
      const matchState = getHybridMatchState();
      const hardNoMatchEffective = blocksNotReadyHold ? false : matchState.hardNoMatch;
      if (speechPresent && hardNoMatchEffective) {
        if (!(hardNoMatchSinceMs > 0)) {
          hardNoMatchSinceMs = now2;
        }
      } else if (hardNoMatchSinceMs > 0) {
        hardNoMatchSinceMs = 0;
      }
      const hardNoMatchAgeMs = hardNoMatchSinceMs > 0 ? Math.max(0, now2 - hardNoMatchSinceMs) : 0;
      const hardNoMatchOffScriptActive = !blocksNotReadyHold && speechPresent && hardNoMatchEffective && hardNoMatchAgeMs >= HYBRID_HARD_NOMATCH_OFFSCRIPT_GRACE_MS;
      if (hardNoMatchOffScriptActive && !hybridSilence.offScriptActive) {
        setHybridScale2(OFFSCRIPT_DEEP);
      }
      const driftWeakMatch = isHybridDriftWeak(errorInfo);
      const gateWeakMatch = blocksNotReadyHold ? false : matchState.weakMatch || driftWeakMatch;
      const gateEffectiveOffScript = blocksNotReadyHold ? false : (safeSilence.offScriptActive ?? false) || gateWeakMatch || hardNoMatchOffScriptActive;
      const hybridScaleDetail = computeEffectiveHybridScale(
        now2,
        safeSilence,
        void 0,
        gateEffectiveOffScript,
        null,
        gateWeakMatch
      );
      const scale = hybridScaleDetail.scale;
      const brake = getActiveBrakeFactor(now2);
      const pxCandidate = baseHybridPxPerSec * scale * brake;
      const fallback = Math.max(
        HYBRID_CTRL_MIN_PXPS,
        Number.isFinite(baseHybridPxPerSec) ? baseHybridPxPerSec : HYBRID_CTRL_MIN_PXPS
      );
      const effectivePxPerSec = Number.isFinite(pxCandidate) && pxCandidate > 0 ? pxCandidate : fallback;
      if (isDevMode2() && now2 - lastHybridCtrlDebugTs >= HYBRID_CTRL_DEBUG_THROTTLE_MS) {
        lastHybridCtrlDebugTs = now2;
        const targetTop = Number.isFinite(errorInfo?.targetScrollTop ?? NaN) && errorInfo?.targetScrollTop != null ? errorInfo.targetScrollTop : null;
        const markerTop = Number.isFinite(errorInfo?.markerY ?? NaN) && errorInfo?.markerY != null ? errorInfo.markerY : null;
        const deltaPx = Number.isFinite(errorInfo?.errorPx ?? NaN) && errorInfo?.errorPx != null ? errorInfo.errorPx : null;
        const deltaLines = Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null ? errorInfo.errorLines : null;
        try {
          console.info("[HYBRID_CTRL] px-debug", {
            baselinePxps: baseHybridPxPerSec,
            targetTop,
            markerTop,
            deltaPx,
            deltaLines,
            normalizedScale: hybridScale,
            computedScale: scale,
            brake,
            reason: hybridScaleDetail.reason,
            offScript: hybridSilence.offScriptActive,
            pausedBySilence: silencePaused,
            effectivePxPerSec,
            anchorTop: Number.isFinite(errorInfo?.anchorTop ?? NaN) ? errorInfo?.anchorTop : null,
            currentTop: Number.isFinite(errorInfo?.currentScrollTop ?? NaN) ? errorInfo?.currentScrollTop : null,
            targetTopSource: errorInfo?.targetTopSource ?? null
          });
        } catch {
        }
      }
      const shouldRunHybrid = wantEnabled && effectivePxPerSec >= HYBRID_CTRL_MIN_PXPS;
      const viewerEl = viewer;
      const guardSlowActive = gateEffectiveOffScript;
      const snap = {
        mode: state22.mode,
        phase: sessionPhase2,
        hybridWantedRunning,
        asrEnabled: speechPresent,
        speechPresent,
        speechHoldRemainingMs: Math.round(speechHoldRemainingMs),
        lastSpeechAgeMs,
        liveGraceActive,
        isSilent,
        pausedBySilence: silencePaused,
        offScript: gateEffectiveOffScript,
        basePxps: hybridBasePxps,
        scale: hybridScale,
        effectivePxps: effectivePxPerSec,
        sessionIntentOn,
        userEnabled,
        gatePref,
        gateWanted,
        phaseAllowed,
        blocked: hybridBlockedReason,
        blocksReady: runtime.blocksReady,
        blockCount: runtime.blockCount,
        blockSource: runtime.blockSource,
        blockSchemaVersion: runtime.schemaVersion,
        scriptHash: runtime.scriptHash,
        scriptSig: runtime.scriptSig,
        matcherSource: runtime.matcherSource,
        matcherSourceDetail: runtime.matcherSourceDetail,
        backendReady: runtime.backendReady,
        blocksNotReadyHold,
        hardNoMatch: hardNoMatchEffective,
        hardNoMatchAgeMs: Math.round(hardNoMatchAgeMs),
        hardNoMatchOffScriptActive,
        viewer: {
          has: !!viewerEl,
          top: viewerEl?.scrollTop ?? -1,
          h: viewerEl?.clientHeight ?? -1,
          sh: viewerEl?.scrollHeight ?? -1,
          max: viewerEl ? Math.max(0, viewerEl.scrollHeight - viewerEl.clientHeight) : -1
        },
        motor: {
          has: !!hybridMotor,
          running: hybridRunning,
          movedRecently: hybridMotor.movedRecently()
        }
      };
      const fingerprintParts = [
        state22.mode,
        sessionPhase2,
        hybridWantedRunning ? "1" : "0",
        userEnabled ? "1" : "0",
        speechPresent ? "1" : "0",
        gatePref,
        gateWanted ? "1" : "0",
        phaseAllowed ? "1" : "0",
        guardSlowActive ? "1" : "0",
        silencePaused ? "1" : "0",
        hybridRunning ? "1" : "0",
        shouldRunHybrid ? "1" : "0",
        Number.isFinite(effectivePxPerSec) ? effectivePxPerSec.toFixed(1) : "0",
        Number.isFinite(hybridBasePxps) ? hybridBasePxps.toFixed(0) : "0",
        runtime.blocksReady ? "1" : "0",
        blocksNotReadyHold ? "1" : "0"
      ];
      const gateFingerprint = fingerprintParts.join("|");
      logHybridTrace(
        "gate_decision",
        {
          shouldRunHybrid,
          gateReason: hybridBlockedReason,
          speechPresent,
          holdMs: Math.round(speechHoldRemainingMs),
          offScriptActive: gateEffectiveOffScript,
          hardNoMatch: hardNoMatchEffective,
          blocksNotReadyHold,
          gateWanted,
          gateSatisfied,
          wantEnabled,
          effectivePxps: Number(effectivePxPerSec.toFixed(2))
        },
        {
          signature: gateFingerprint
        }
      );
      if (gateFingerprint !== lastHybridGateFingerprint) {
        lastHybridGateFingerprint = gateFingerprint;
        try {
          console.warn("[HYBRID] gate", snap);
        } catch {
        }
      }
      if (blocksNotReadyHold || gateEffectiveOffScript || matchState.hardNoMatch) {
        logHybridMatcherProbe("gate", {
          blocksReady: runtime.blocksReady,
          blockCount: runtime.blockCount,
          blockSource: runtime.blockSource,
          scriptHash: runtime.scriptHash,
          scriptSig: runtime.scriptSig,
          matcherSource: runtime.matcherSource,
          matcherSourceDetail: runtime.matcherSourceDetail,
          backendReady: runtime.backendReady,
          blocksNotReadyHold,
          hardNoMatch: hardNoMatchEffective,
          hardNoMatchAgeMs: Math.round(hardNoMatchAgeMs),
          hardNoMatchOffScriptActive,
          weakMatch: gateWeakMatch,
          offScriptActive: gateEffectiveOffScript,
          speechActive: speechPresent,
          lastSpeechAgeMs: Math.round(lastSpeechAgeMs)
        });
      }
      if (shouldRunHybrid) {
        if (silenceTimer) {
          try {
            clearTimeout(silenceTimer);
          } catch {
          }
          silenceTimer = void 0;
        }
        try {
          applyHybridVelocityCore2(safeSilence);
        } catch {
        }
        if (!hybridRunning) {
          if (isDevMode2()) {
            try {
              const sliderValue = (() => {
                const slider = document.getElementById("wpmTarget");
                if (!slider) return null;
                const raw = Number(slider.value);
                return Number.isFinite(raw) && raw > 0 ? raw : null;
              })();
              const storedValue = (() => {
                const raw = Number(localStorage.getItem("tp_baseline_wpm"));
                return Number.isFinite(raw) && raw > 0 ? raw : null;
              })();
              const clampReason = blocksNotReadyHold ? "blocks-not-ready-hold" : silencePaused ? "silence" : gateEffectiveOffScript ? "offscript" : hybridScaleDetail.reason || "none";
              const speedSettingRaw = getHybridSpeedSettingRaw();
              console.info("[HYBRID_SPEED]", {
                sliderValue: speedSettingRaw ?? sliderValue,
                storedValue,
                speedSettingRaw,
                speedUnit: "wpm",
                basePxpsComputed: Number(baseHybridPxPerSec.toFixed(2)),
                clampReason
              });
            } catch {
            }
          }
          try {
            console.info("[HYBRID] shouldRun true starting motor", {
              isRunningBefore: hybridRunning,
              pxPerSec: effectivePxPerSec,
              viewer: viewer ? viewer.id || viewer.tagName || viewer.className : null,
              scrollWriter: !!scrollWriter
            });
          } catch {
          }
          const startResult = hybridMotor.start();
          if (startResult.started) {
            setActiveMotor("hybrid", "hybrid");
          }
          if (!startResult.started) {
            try {
              console.debug("[HYBRID] start suppressed", startResult);
            } catch {
            }
          }
        }
        armHybridSilenceTimer2();
      } else if (hybridRunning) {
        if (silenceTimer) {
          try {
            clearTimeout(silenceTimer);
          } catch {
          }
          silenceTimer = void 0;
        }
        hybridMotor.stop();
        clearActiveMotor("hybrid");
        emitMotorState2("hybridWpm", false);
        clearHybridSilenceTimer();
      }
      const detail = `Mode: Hybrid \u2022 Pref: ${gatePref} \u2022 User: ${userEnabled ? "On" : "Off"} \u2022 Phase:${phaseAllowed ? "live" : "blocked"} \u2022 Speech:${speechPresent ? "1" : "0"} \u2022 dB:${dbGate ? "1" : "0"} \u2022 VAD:${vadGate ? "1" : "0"}`;
      const chipState = userEnabled ? hybridMotor.isRunning() ? "on" : "paused" : "manual";
      setAutoChip(chipState, detail, "Motor");
      emitMotorState2("hybridWpm", hybridMotor.isRunning());
    } catch (err) {
      try {
        console.error("[HYBRID] gate error", err?.message ?? err, err);
      } catch {
      }
      return;
    }
  }
  onUiPrefs((p) => {
    gatePref = p.hybridGate;
    applyGate();
  });
  try {
    if (typeof appStoreSingleton.subscribe === "function") {
      appStoreSingleton.subscribe("session.phase", (phase) => {
        const prevPhase = sessionPhase2;
        sessionPhase2 = String(phase || "idle");
        hybridSessionPhase = sessionPhase2;
        if (sessionPhase2 === "live" && state22.mode === "asr") {
          asrIntentLiveSince = Date.now();
          resetAsrIntentState("session-live");
          try {
            window.__tpScrollWriteActive = false;
          } catch {
          }
        }
        if (sessionPhase2 !== "live") {
          stopAllMotors("phase change");
          liveSessionWpmLocked = false;
          wpmSliderUserTouched = false;
          userWpmLocked = false;
          asrIntentLiveSince = 0;
          resetAsrIntentState("session-exit");
        } else if (prevPhase !== "live") {
          liveSessionWpmLocked = true;
          syncSliderWpmBeforeLiveStart();
          beginHybridLiveGraceWindow();
        }
        applyGate();
        emitScrollModeSnapshot(`phase:${sessionPhase2}`);
      });
      appStoreSingleton.subscribe("session.scrollAutoOnLive", () => {
        applyGate();
      });
      appStoreSingleton.subscribe("scrollMode", (modeRaw) => {
        const normalized = normalizeScrollModeValue(modeRaw);
        if (normalized !== "asr") return;
        stopAllMotors("mode-enter-asr");
        userEnabled = false;
        userIntentOn = false;
        sessionIntentOn = false;
        hybridWantedRunning = false;
        hybridSilence.pausedBySilence = false;
        clearHybridSilenceTimer();
        enabledNow = false;
        asrIntentLiveSince = 0;
        try {
          auto?.setEnabled?.(false);
        } catch {
        }
        persistStoredAutoEnabled(false);
        try {
          emitMotorState2("auto", false);
        } catch {
        }
        try {
          emitMotorState2("hybridWpm", false);
        } catch {
        }
        try {
          emitAutoState();
        } catch {
        }
      });
    }
  } catch {
  }
  function syncSliderWpmBeforeLiveStart() {
    if (typeof document === "undefined") {
      liveSessionWpmLocked = false;
      return;
    }
    if (getScrollMode2() === "asr") {
      liveSessionWpmLocked = false;
      return;
    }
    if (userWpmLocked) {
      liveSessionWpmLocked = false;
      return;
    }
    let nextWpm = Number.NaN;
    const store2 = (typeof window !== "undefined" ? window.__tpStore : null) || appStoreSingleton;
    try {
      const sliderInput = document.getElementById("wpmTarget");
      if (sliderInput) {
        const sliderVal = Number(sliderInput.value);
        if (Number.isFinite(sliderVal) && sliderVal > 0) {
          nextWpm = sliderVal;
        }
      }
      if (!Number.isFinite(nextWpm) || nextWpm <= 0) {
        const stored = typeof store2?.get === "function" ? store2.get("wpmTarget") : void 0;
        if (typeof stored === "number" && stored > 0) {
          nextWpm = stored;
        }
      }
      if (!Number.isFinite(nextWpm) || nextWpm <= 0) {
        nextWpm = 180;
      }
      if (sliderInput) {
        setSliderValueSilently(sliderInput, String(nextWpm));
      }
      if (typeof store2?.set === "function") {
        try {
          store2.set("wpmTarget", nextWpm);
        } catch {
        }
      }
      const pxs = convertWpmToPxPerSec(nextWpm);
      if (Number.isFinite(pxs) && pxs > 0) {
        applyWpmBaselinePx(pxs, "session-start");
      }
    } catch {
    } finally {
      liveSessionWpmLocked = false;
    }
  }
  const WPM_INTENT_EVENT = "tp:wpm:intent";
  function applyWpmBaselinePx(pxs, source, wpmValue) {
    if (!Number.isFinite(pxs) || pxs <= 0) return;
    if (getScrollMode2() === "asr") return;
    const storeWpm = (() => {
      try {
        const raw = localStorage.getItem("tp_baseline_wpm");
        const num2 = raw ? Number(raw) : NaN;
        return Number.isFinite(num2) ? num2 : NaN;
      } catch {
        return NaN;
      }
    })();
    const sliderValue = (() => {
      try {
        const slider = document.getElementById("wpmTarget");
        if (!slider) return NaN;
        const num2 = Number(slider.value);
        return Number.isFinite(num2) ? num2 : NaN;
      } catch {
        return NaN;
      }
    })();
    try {
      console.info("[HYBRID] baseline writer", {
        pxPerSec: pxs,
        source,
        storeWpm,
        sliderValue,
        hybridBase: hybridBasePxps,
        hybridScale
      });
    } catch {
    }
    sliderTouchedThisSession = true;
    recordUserWpmPx(pxs);
    setHybridScale2(RECOVERY_SCALE);
    setHybridBasePxps(pxs);
    startHybridMotorFromSpeedChange();
    logHybridBaselineState(source);
    if (isDevMode2()) {
      try {
        console.info("[HYBRID_BASE] set", {
          pxPerSec: pxs,
          wpm: Number.isFinite(wpmValue ?? NaN) ? wpmValue : void 0,
          source,
          hybridBase: hybridBasePxps,
          scale: hybridScale
        });
      } catch {
      }
    }
    if (state22.mode === "wpm") {
      try {
        auto.setSpeed?.(pxs);
      } catch {
      }
    }
  }
  function emitWpmIntent(wpm, source, pxPerSec) {
    if (!Number.isFinite(wpm) || wpm <= 0) return;
    if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return;
    if (typeof window === "undefined") return;
    if (lastWpmIntent && lastWpmIntent.wpm === wpm && lastWpmIntent.source === source) return;
    noteWpmIntent(wpm, source);
    const detail = { wpm, source };
    try {
      window.dispatchEvent(new CustomEvent(WPM_INTENT_EVENT, { detail }));
    } catch {
    }
    try {
      window.dispatchEvent(new CustomEvent("tp:wpm:change", {
        detail: { wpm, source, pxPerSec }
      }));
    } catch {
    }
  }
  function handleSidebarWpmChange(val, label) {
    if (suppressWpmUiEcho) return;
    if (!Number.isFinite(val) || val <= 0) return;
    try {
      localStorage.setItem("tp_baseline_wpm", String(val));
    } catch {
    }
    userWpmLocked = true;
    const pxs = convertWpmToPxPerSec(val);
    if (!Number.isFinite(pxs) || pxs <= 0) return;
    markSliderInteraction();
    emitWpmIntent(val, "sidebar", pxs);
    applyWpmBaselinePx(pxs, label, val);
    persistProfilePatch({
      scroll: {
        mode: "wpm",
        wpm: { value: val }
      }
    });
    if (state22.mode === "wpm") {
      try {
        if (orchRunning) {
          const status = orch.getStatus();
          const detectedWpm = status.wpm;
          if (detectedWpm && isFinite(detectedWpm) && detectedWpm > 0) {
            const sensitivity = val / detectedWpm;
            orch.setSensitivity(sensitivity);
          } else {
            orch.setSensitivity(1);
          }
        }
      } catch {
      }
    }
  }
  function resolveWpmDetail(detail) {
    const pxRaw = Number(detail.pxPerSec);
    const incomingWpmRaw = Number(detail.wpm);
    const incomingWpm = Number.isFinite(incomingWpmRaw) ? incomingWpmRaw : void 0;
    if (Number.isFinite(pxRaw) && pxRaw > 0) {
      const source = typeof detail.source === "string" && detail.source.length > 0 ? detail.source : "tp:wpm:change";
      return { pxPerSec: pxRaw, source, wpm: incomingWpm };
    }
    const wpm = Number(detail.wpm);
    if (Number.isFinite(wpm) && wpm > 0) {
      const pxFromWpm = convertWpmToPxPerSec(wpm);
      if (Number.isFinite(pxFromWpm) && pxFromWpm > 0) {
        const source = typeof detail.source === "string" && detail.source.length > 0 ? detail.source : "tp:wpm:intent";
        return { pxPerSec: pxFromWpm, source, wpm };
      }
    }
    return null;
  }
  try {
    const handleWpmEvent = (detail, eventName) => {
      const resolved = resolveWpmDetail(detail);
      if (!resolved) return;
      const { pxPerSec, source, wpm } = resolved;
      if (eventName !== WPM_INTENT_EVENT && userWpmLocked) {
        try {
          console.warn("[WPM_LEGACY] ignored (userWpmLocked=1)", { eventName, source });
        } catch {
        }
        return;
      }
      if (eventName === "tp:wpm:change" && source === "sidebar") return;
      if (source === "store" && userWpmLocked) return;
      const sourceIsSlider = isSliderWpmSource(source);
      if (liveSessionWpmLocked && !sourceIsSlider) {
        return;
      }
      if (hybridMotor.isRunning() && !sourceIsSlider && wpmSliderUserTouched) {
        return;
      }
      const now2 = nowMs();
      const withinUserEvent = lastUserWpmPx > 0 && now2 - lastUserWpmAt <= WPM_USER_DEDUPE_MS;
      if (withinUserEvent && Math.abs(lastUserWpmPx - pxPerSec) < 0.5) {
        return;
      }
      applyWpmBaselinePx(pxPerSec, source, wpm);
    };
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t?.id === "wpmTarget") {
        try {
          handleSidebarWpmChange(Number(t.value), "slider-change");
        } catch {
        }
        flushProfilePersister();
      }
    }, { capture: true });
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t?.id === "wpmTarget") {
        try {
          handleSidebarWpmChange(Number(t.value), "slider-input");
        } catch {
        }
      }
    }, { capture: true });
    window.addEventListener("tp:wpm:change", (ev) => {
      try {
        handleWpmEvent(ev.detail || {}, "tp:wpm:change");
      } catch {
      }
    });
    window.addEventListener("tp:wpm:intent", (ev) => {
      try {
        const detail = ev?.detail || {};
        const wpmValue = Number(detail.wpm);
        const source = typeof detail.source === "string" ? detail.source : "unknown";
        if (Number.isFinite(wpmValue) && wpmValue > 0) {
          noteWpmIntent(wpmValue, source);
        }
        try {
          console.info("[WPM_INTENT] recv", { wpm: wpmValue, source });
        } catch {
        }
        handleWpmEvent(detail, "tp:wpm:intent");
      } catch {
      }
    });
    document.addEventListener("pointerup", (ev) => {
      try {
        const target = ev.target;
        if (target?.id !== "wpmTarget") return;
        flushProfilePersister();
      } catch {
      }
    }, { capture: true });
  } catch {
  }
  try {
    window.addEventListener("tp:asr:silence", (ev) => {
      try {
        const detail = ev.detail || {};
        const silent = !!detail.silent;
        const perfNow = nowMs();
        const rawTs = typeof detail.ts === "number" ? detail.ts : perfNow;
        const normalizedTs = normalizePerfTimestamp(rawTs, perfNow);
        if (silent) {
          speechActive = false;
          if (!(hybridSilence.lastSpeechAtMs > 0)) {
            hybridSilence.lastSpeechAtMs = normalizedTs;
          }
          if (hybridSilence.pausedBySilence) {
            armHybridSilenceTimer2();
          } else {
            const lastSpeechAtMs = hybridSilence.lastSpeechAtMs > 0 ? hybridSilence.lastSpeechAtMs : normalizedTs;
            const silentForMs = Math.max(0, normalizedTs - lastSpeechAtMs);
            const remainingMs = Math.max(1, computeHybridSilenceDelayMs() - silentForMs);
            armHybridSilenceTimer2(remainingMs);
          }
          try {
            applyGate();
          } catch {
          }
        } else {
          noteHybridSpeechActivity(normalizedTs, { source: "silence" });
        }
      } catch {
      }
    });
  } catch {
  }
  try {
    window.addEventListener("tp:preroll:done", () => {
      try {
        if (state22.mode !== "hybrid") return;
        if (!hybridWantedRunning) return;
        if (sessionPhase2 !== "live") return;
        seedHybridBaseSpeed2();
        const now2 = nowMs();
        liveGraceWindowEndsAt = null;
        hybridSilence.lastSpeechAtMs = now2;
        hybridSilence.pausedBySilence = false;
        setHybridScale2(RECOVERY_SCALE);
        runHybridVelocity(hybridSilence);
        if (!hybridMotor.isRunning()) {
          hybridMotor.start();
          emitMotorState2("hybridWpm", true);
        }
        armHybridSilenceTimer2(computeHybridSilenceDelayMs());
        emitHybridSafety();
        applyGate();
        if (isDevMode2()) {
          try {
            console.info("[HYBRID] preroll done baseline kick", {
              hybridBasePxps,
              scale: hybridScale
            });
          } catch {
          }
        }
      } catch {
      }
    });
  } catch {
  }
  try {
    document.addEventListener("keydown", (e) => {
      try {
        if (window.__TP_REHEARSAL) return;
      } catch {
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        stepOnce(1);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        stepOnce(-1);
        return;
      }
      if (state22.mode === "step" && e.key === " ") {
        e.preventDefault();
        holdCreepStart(DEFAULTS.step.holdCreep, 1);
      }
    }, { capture: true });
    document.addEventListener("keyup", (e) => {
      try {
        if (window.__TP_REHEARSAL) return;
      } catch {
      }
      if (state22.mode !== "step") return;
      if (e.key === " ") {
        e.preventDefault();
        holdCreepStop();
      }
    }, { capture: true });
  } catch {
  }
  try {
    window.addEventListener("tp:db", (e) => {
      const db = e && e.detail && typeof e.detail.db === "number" ? e.detail.db : -60;
      hybridHandleDb(db, auto);
      dbGate = db >= DEFAULTS.hybrid.thresholdDb;
      scheduleApplyGate();
    });
    window.addEventListener("tp:vad", (e) => {
      const speaking2 = !!(e && e.detail && e.detail.speaking);
      vadGate = speaking2;
      if (speaking2) {
        noteHybridSpeechActivity(nowMs(), { source: "vad" });
      }
      scheduleApplyGate();
    });
  } catch {
  }
  try {
    window.addEventListener("tp:autoIntent", (e) => {
      try {
        const detail = e?.detail || {};
        const on = !!(detail.on ?? detail.enabled);
        setAutoIntentState(on);
      } catch {
      }
    });
    try {
      console.info("[scroll-router] tp:autoIntent listener installed");
    } catch {
    }
    const pending = window.__tpAutoIntentPending;
    if (typeof pending === "boolean") {
      setAutoIntentState(pending);
      try {
        delete window.__tpAutoIntentPending;
      } catch {
      }
    }
  } catch {
  }
  try {
    window.addEventListener("tp:session:intent", (e) => {
      try {
        const detail = e?.detail || {};
        const active = detail.active === true;
        try {
          console.info(
            `[scroll-router] tp:session:intent active=${active} mode=${detail.mode || state22.mode} reason=${detail.reason || "unknown"}`
          );
        } catch {
        }
        setAutoIntentState(active);
      } catch {
      }
    });
    try {
      console.info("[scroll-router] tp:session:intent listener installed");
    } catch {
    }
  } catch {
  }
  if (state22.mode === "hybrid" || state22.mode === "wpm") {
    userEnabled = true;
    hybridWantedRunning = true;
    try {
      if (state22.mode === "wpm") {
        const baselineWpm = parseFloat(localStorage.getItem("tp_baseline_wpm") || "120") || 120;
        const pxs = convertWpmToPxPerSec(baselineWpm);
        auto.setSpeed?.(pxs);
      } else {
        auto.setSpeed?.(getStoredSpeed());
      }
      seedHybridBaseSpeed2();
      ensureOrchestratorForMode();
    } catch {
    }
    applyGate();
  } else {
    applyGate();
  }
  if (state22.mode === "wpm" || state22.mode === "asr") ensureOrchestratorForMode();
  try {
    document.addEventListener("keydown", (e) => {
      try {
        const target = e.target;
        if (!target) return;
        const tag = (target.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || target.isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const wantUp = e.key === "+" || e.code === "NumpadAdd" || e.key === "ArrowUp";
        const wantDown = e.key === "-" || e.code === "NumpadSubtract" || e.key === "ArrowDown";
        if (!wantUp && !wantDown) return;
        e.preventDefault();
        const step = wantUp ? AUTO_STEP_FINE : -AUTO_STEP_FINE;
        const delta = e.shiftKey ? step * AUTO_STEP_COARSE : step;
        const next = nudgeSpeed(delta);
        try {
          window.__scrollCtl?.setSpeed?.(next);
        } catch {
        }
        try {
          const deltaPx = wantUp ? -24 : 24;
          scrollWriter.scrollBy(deltaPx, { behavior: "auto" });
        } catch {
        }
      } catch {
      }
    }, { capture: true });
  } catch {
  }
}

// src/scroll/asr-block-index.ts
var ASR_MIN_SENTENCES_PER_BLOCK = 2;
var ASR_MAX_SENTENCES_PER_BLOCK = 4;
var ASR_MIN_CHARS_PER_BLOCK = 80;
var ASR_MAX_CHARS_PER_BLOCK = 400;

// src/boot/boot-trace.ts
var TRACE_KEY = "__tpBootTrace";
var ENABLE_KEY = "__tpBootTraceEnabled";
var SEQ_KEY = "__tpBootTraceSeq";
function getNow() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch {
  }
  return Date.now();
}
function isEnabledFromEnv() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("boottrace") === "1") return true;
    if (params.get("boottrace") === "0") return false;
    if (params.get("dev") === "1" || params.has("dev")) return true;
  } catch {
  }
  try {
    const hash = String(window.location.hash || "").toLowerCase();
    if (hash.includes("boottrace=1")) return true;
    if (hash.includes("dev")) return true;
  } catch {
  }
  try {
    if (window.localStorage?.getItem("tp_dev_mode") === "1") return true;
  } catch {
  }
  try {
    const w2 = window;
    if (w2.__TP_DEV || w2.__TP_DEV1) return true;
  } catch {
  }
  return false;
}
function getStore() {
  const w2 = window;
  const store2 = w2[TRACE_KEY];
  if (Array.isArray(store2)) return store2;
  const created = [];
  w2[TRACE_KEY] = created;
  return created;
}
function nextSeq() {
  const w2 = window;
  const current = Number(w2[SEQ_KEY]);
  const seq = Number.isFinite(current) ? current + 1 : 1;
  w2[SEQ_KEY] = seq;
  return seq;
}
function isBootTraceEnabled() {
  if (typeof window === "undefined") return false;
  const w2 = window;
  if (typeof w2[ENABLE_KEY] !== "boolean") {
    w2[ENABLE_KEY] = isEnabledFromEnv();
  }
  return !!w2[ENABLE_KEY];
}
function bootTrace(tag, detail) {
  if (typeof window === "undefined") return;
  if (!isBootTraceEnabled()) return;
  try {
    const ev = {
      seq: nextSeq(),
      t: getNow(),
      tag: String(tag || "").trim() || "unknown",
      detail
    };
    getStore().push(ev);
  } catch {
  }
}
function bootTraceGet() {
  if (typeof window === "undefined") return [];
  try {
    return getStore().slice().sort((a, b) => a.seq - b.seq);
  } catch {
    return [];
  }
}
function bootTraceExport() {
  try {
    return JSON.stringify(bootTraceGet(), null, 2);
  } catch {
    return "[]";
  }
}
function bootTraceDumpToConsole() {
  if (typeof window === "undefined") return;
  if (!isBootTraceEnabled()) return;
  const events = bootTraceGet();
  try {
    console.groupCollapsed(`[BOOTTRACE] ${events.length} events`);
    for (const ev of events) {
      console.log(`${ev.t.toFixed(1)}ms`, ev.tag, ev.detail ?? "");
    }
    console.groupEnd();
  } catch {
  }
}
try {
  if (typeof window !== "undefined") {
    if (typeof window.tpBootTraceGet !== "function") window.tpBootTraceGet = bootTraceGet;
    if (typeof window.tpBootTraceDump !== "function") window.tpBootTraceDump = bootTraceDumpToConsole;
    if (typeof window.tpBootTraceExport !== "function") window.tpBootTraceExport = bootTraceExport;
  }
} catch {
}

// src/render-script.ts
try {
  console.warn("[ROUTER_STAMP] render-script", ROUTER_STAMP);
} catch {
}
function formatInline(line) {
  return formatInlineMarkup(line);
}
var SPEAKER_CLASS = {
  s1: "speaker-s1",
  s2: "speaker-s2",
  guest1: "speaker-guest1",
  guest2: "speaker-guest2"
};
function normalizeScript(raw) {
  try {
    const txt = normalizeToStandardText(raw);
    if (txt) return txt;
  } catch {
  }
  try {
    const txt = fallbackNormalizeText(raw);
    if (txt) return txt;
  } catch {
  }
  return String(raw || "");
}
function applyInlineColors(scope) {
  try {
    scope.querySelectorAll("[data-color]").forEach((el) => {
      const color = el.dataset.color || "";
      if (!color) return;
      if (el.classList.contains("fg")) {
        el.style.color = color;
      }
      if (el.classList.contains("bg")) {
        el.style.backgroundColor = color;
      }
    });
  } catch {
  }
}
function resolveSpeakerTag(tag) {
  const t = tag.toLowerCase();
  if (t === "s1") return "s1";
  if (t === "s2") return "s2";
  if (t === "g1" || t === "guest1") return "guest1";
  if (t === "g2" || t === "guest2") return "guest2";
  return null;
}
var viewerScrollRouterInstalled = false;
function isDevMode3() {
  try {
    const qs = new URLSearchParams(String(location.search || ""));
    if (qs.has("dev") || qs.get("dev") === "1") return true;
    if (qs.has("dev1") || qs.get("dev1") === "1") return true;
    if (qs.has("ci") || qs.get("ci") === "1") return true;
    if (window.__TP_DEV || window.__TP_DEV1) return true;
    if (localStorage.getItem("tp_dev_mode") === "1") return true;
  } catch {
  }
  return false;
}
function normalizeAsrText(input) {
  const raw = String(input || "");
  const stripped = raw.replace(/\[[^\]]+\]/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.toLowerCase();
}
function countSentences(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  const cleaned = t.replace(/\.{3,}/g, ".");
  const matches = cleaned.match(/[.!?]+/g);
  if (!matches || matches.length === 0) return 1;
  return matches.length;
}
function chunkAsrUnits(units) {
  const blocks = [];
  const warnings = [];
  if (!units.length) return { blocks, warnings };
  let start = 0;
  let sentences = 0;
  let chars = 0;
  const closeBlock = (endIdx) => {
    const blockIdx = blocks.length;
    blocks.push({
      blockIdx,
      unitStart: start,
      unitEnd: endIdx,
      sentenceCount: sentences,
      charCount: chars
    });
  };
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    sentences += unit.sentenceCount;
    chars += unit.charCount;
    if (unit.charCount >= ASR_MAX_CHARS_PER_BLOCK) {
      warnings.push(`Unit ${i} oversized (${unit.charCount} chars)`);
    }
    const meetsMin = sentences >= ASR_MIN_SENTENCES_PER_BLOCK && chars >= ASR_MIN_CHARS_PER_BLOCK;
    const meetsMax = sentences >= ASR_MAX_SENTENCES_PER_BLOCK || chars >= ASR_MAX_CHARS_PER_BLOCK;
    if (meetsMin || meetsMax) {
      closeBlock(i);
      start = i + 1;
      sentences = 0;
      chars = 0;
    }
  }
  if (start < units.length) {
    closeBlock(units.length - 1);
  }
  return { blocks, warnings };
}
function renderScript(text, container) {
  console.log("[LIVE SCRIPT RENDERER] executing", { ts: Date.now() });
  const raw = String(text ?? "");
  bootTrace("render-script:enter", { length: raw.length });
  try {
    window.__tpRawScript = raw;
  } catch {
  }
  const root = container || document.getElementById("script") || document.querySelector(".script") || document.querySelector("#viewer") || document.querySelector('[data-role="viewer"]') || document.querySelector("[data-script-view]");
  if (!root) {
    try {
      console.warn("[render] #script container not found");
    } catch {
    }
    return;
  }
  const normalized = normalizeScript(raw).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const frag = document.createDocumentFragment();
  const viewer2 = (root.id === "viewer" ? root : root.closest("#viewer")) || null;
  try {
    const markerPct = typeof window.__TP_MARKER_PCT === "number" ? window.__TP_MARKER_PCT : 0.4;
    const host = viewer2 || root;
    const h = host.clientHeight || window.innerHeight || 0;
    const markerOffset = Math.max(0, Math.round(h * markerPct));
    try {
      root.style.paddingTop = `${markerOffset}px`;
    } catch {
    }
    try {
      root.style.scrollPaddingTop = "";
    } catch {
    }
    if (viewer2) {
      viewer2.style.paddingTop = "0px";
      viewer2.style.scrollPaddingTop = `${markerOffset}px`;
      const viewerHeight = viewer2.clientHeight || 0;
      if (viewerHeight > 0 && markerOffset > viewerHeight * 2) {
        try {
          console.warn("[MARKER] insane offset", { markerOffset, viewerHeight });
        } catch {
        }
      }
    }
    try {
      const padTarget = root.id ? `#${root.id}` : root.className ? `.${root.className}` : root.tagName.toLowerCase();
      const scrollPadTarget = viewer2 ? viewer2.id ? `#${viewer2.id}` : viewer2.className ? `.${viewer2.className}` : viewer2.tagName.toLowerCase() : "none";
      console.info([
        "[MARKER_PADDING]",
        `markerPct=${markerPct}`,
        `hostH=${Math.round(h)}`,
        `markerOffset=${markerOffset}`,
        `paddingTop=${padTarget}`,
        `scrollPaddingTop=${scrollPadTarget}`
      ].join(" "));
      if (!viewerScrollRouterInstalled && viewer2) {
        bootTrace("render-script:scroll-router-runtime:install:start");
        try {
          console.warn("[SCROLL_ROUTER] render-script installing router now");
        } catch {
        }
        const auto2 = createAutoMotor();
        const viewerEl = document.getElementById("viewer");
        const hostEl = viewerEl || root;
        const mode = window.__tpCurrentScrollMode || window.__tpScrollMode || "unknown";
        const viewerInfo = viewerEl ? `${viewerEl.id || "no-id"} ${viewerEl.className || "no-class"}` : "no-viewer";
        const hybridMotorInit = !!auto2;
        const listenersWired = !!window.__tpHybridListenersReady;
        try {
          console.warn("[SCROLL_ROUTER] install debug", {
            mode,
            viewer: viewerInfo.trim(),
            hybridMotorInit,
            listenersWired
          });
        } catch {
        }
        try {
          console.info("ABOUT TO CALL installScrollRouter");
        } catch {
        }
        try {
          installScrollRouter({ auto: auto2, viewer: !!viewerEl, hostEl });
          try {
            console.info("RETURNED FROM installScrollRouter");
          } catch {
          }
          try {
            window.__tpAuto = auto2;
          } catch {
          }
          viewerScrollRouterInstalled = true;
          bootTrace("render-script:scroll-router-runtime:install:done");
        } catch (error) {
          bootTrace("render-script:scroll-router-runtime:install:error", { error: String(error) });
          try {
            const errObj = error instanceof Error ? error : new Error(String(error));
            console.error("[SCROLL_ROUTER] install failure context", {
              mode,
              viewer: viewerInfo.trim(),
              hybridMotorInit,
              listenersWired
            });
            console.error("[SCROLL_ROUTER] INSTALL FAILED", errObj);
            if (errObj.stack) {
              console.error(errObj.stack);
            }
          } catch {
          }
        }
      }
    } catch {
    }
  } catch {
  }
  let currentSpeaker = null;
  let devLineIndexWarningLogged = false;
  let inNote = false;
  try {
    root.textContent = "";
  } catch {
  }
  let renderedLineIndex = 0;
  const nodeEntries = [];
  const asrUnits = [];
  const asrUnitEls = [];
  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i] ?? "";
    let trimmed = rawLine.trim();
    if (!trimmed) {
      const div2 = document.createElement("div");
      div2.className = "line line-empty";
      div2.innerHTML = "&nbsp;";
      const renderIdx2 = String(renderedLineIndex);
      div2.id = `tp-line-${renderIdx2}`;
      div2.dataset.i = renderIdx2;
      div2.dataset.index = renderIdx2;
      div2.dataset.line = renderIdx2;
      div2.dataset.lineIdx = renderIdx2;
      div2.dataset.rawLine = String(i);
      nodeEntries.push({ el: div2, unitIdx: null });
      renderedLineIndex += 1;
      continue;
    }
    const openSolo = trimmed.match(/^\[\s*(s1|s2|guest1|guest2|g1|g2)\s*\]$/i);
    if (openSolo) {
      const key = resolveSpeakerTag(openSolo[1]);
      if (key) currentSpeaker = key;
      continue;
    }
    const closeSolo = trimmed.match(/^\[\/\s*(s1|s2|guest1|guest2|g1|g2)\s*\]$/i);
    if (closeSolo) {
      currentSpeaker = null;
      continue;
    }
    const leadingOpen = rawLine.match(/^\s*\[\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*/i);
    if (leadingOpen) {
      const key = resolveSpeakerTag(leadingOpen[1]);
      if (key) currentSpeaker = key;
      rawLine = rawLine.slice(leadingOpen[0].length);
      trimmed = rawLine.trim();
    }
    let closeAfterLine = false;
    const trailingClose = rawLine.match(/\s*\[\s*\/\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*$/i);
    if (trailingClose) {
      closeAfterLine = true;
      rawLine = rawLine.slice(0, rawLine.length - trailingClose[0].length);
      trimmed = rawLine.trim();
    }
    if (/^\[\s*note\s*\]$/i.test(trimmed)) {
      inNote = true;
      continue;
    }
    if (/^\[\/\s*note\s*\]$/i.test(trimmed)) {
      inNote = false;
      continue;
    }
    if (inNote) {
      continue;
    }
    const div = document.createElement("div");
    div.className = "line";
    const renderIdx = String(renderedLineIndex);
    div.id = `tp-line-${renderIdx}`;
    div.dataset.i = renderIdx;
    div.dataset.index = renderIdx;
    div.dataset.line = renderIdx;
    div.dataset.lineIdx = renderIdx;
    div.dataset.rawLine = String(i);
    if (currentSpeaker) {
      div.classList.add(SPEAKER_CLASS[currentSpeaker]);
      div.dataset.speaker = currentSpeaker;
    }
    const html = formatInline(rawLine);
    div.innerHTML = html || "&nbsp;";
    applyInlineColors(div);
    const textNorm = normalizeAsrText(rawLine);
    const unitIdx = textNorm ? (() => {
      const sentenceCount = countSentences(textNorm);
      const charCount = textNorm.length;
      const unit = {
        textNorm,
        sentenceCount,
        charCount
      };
      const idx = asrUnits.length;
      asrUnits.push(unit);
      asrUnitEls.push(div);
      return idx;
    })() : null;
    nodeEntries.push({ el: div, unitIdx });
    renderedLineIndex += 1;
    if (closeAfterLine) {
      currentSpeaker = null;
    }
  }
  const { blocks, warnings } = chunkAsrUnits(asrUnits);
  const unitToBlock = new Array(asrUnits.length).fill(0);
  blocks.forEach((b) => {
    for (let u = b.unitStart; u <= b.unitEnd; u++) unitToBlock[u] = b.blockIdx;
  });
  const blockEls2 = [];
  const appendedBlocks = /* @__PURE__ */ new Set();
  const ensureBlock = (idx) => {
    if (blockEls2[idx]) return blockEls2[idx];
    const el = document.createElement("div");
    el.className = "tp-asr-block";
    el.dataset.tpBlock = String(idx);
    blockEls2[idx] = el;
    if (!appendedBlocks.has(idx)) {
      frag.appendChild(el);
      appendedBlocks.add(idx);
    }
    return el;
  };
  let lastBlockIdx = -1;
  for (const entry of nodeEntries) {
    let bIdx = 0;
    if (blocks.length) {
      if (entry.unitIdx != null) {
        bIdx = unitToBlock[entry.unitIdx] ?? 0;
      } else {
        bIdx = lastBlockIdx >= 0 ? lastBlockIdx : 0;
      }
    }
    const blockEl = ensureBlock(bIdx);
    blockEl.appendChild(entry.el);
    lastBlockIdx = bIdx;
  }
  if (!blocks.length && nodeEntries.length && !blockEls2.length) {
    const blockEl = ensureBlock(0);
    for (const entry of nodeEntries) blockEl.appendChild(entry.el);
  }
  try {
    root.appendChild(frag);
  } catch {
  }
  try {
    const meta2 = {
      schemaVersion: 1,
      blockCount: blockEls2.length,
      createdAt: isDevMode3() ? Date.now() : 0,
      source: "render",
      units: blocks.map((b) => ({
        blockIdx: b.blockIdx,
        unitStart: b.unitStart,
        unitEnd: b.unitEnd,
        sentenceCount: b.sentenceCount,
        charCount: b.charCount
      })),
      warnings: warnings.length ? warnings : void 0
    };
    setAsrBlocks(blockEls2, meta2);
  } catch {
  }
  if (isDevMode3()) {
    try {
      let ok = true;
      if (!blockEls2.length) ok = false;
      for (let i = 0; i < blockEls2.length; i++) {
        const el = blockEls2[i];
        if (!el || el.dataset.tpBlock !== String(i)) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        try {
          window.__tpAsrBlocksReady = false;
        } catch {
        }
        console.error("[render] ASR block index invalid", {
          blocks: blockEls2.length,
          warnings
        });
      }
    } catch {
    }
  }
  try {
    const placeholder = viewer2?.querySelector(".empty-msg");
    if (placeholder) placeholder.remove();
  } catch {
  }
  try {
    root.dataset.lineCount = String(renderedLineIndex);
  } catch {
  }
  try {
    root.scrollTop = 0;
  } catch {
  }
  try {
    if (window.__TP_DEV || window.__TP_DEV1) {
      const lineEls = Array.from(root.querySelectorAll(".line[data-line]"));
      const maxLineIdx = lineEls.reduce((max, el) => {
        const idx = Number(el.dataset.line ?? -1);
        return Number.isFinite(idx) ? Math.max(max, idx) : max;
      }, -1);
      if (lineEls.length && maxLineIdx !== lineEls.length - 1 && !devLineIndexWarningLogged) {
        devLineIndexWarningLogged = true;
        console.warn("[render] line index mismatch", {
          rendered: lineEls.length,
          maxLineIdx
        });
      }
      if (lineEls.length && lineEls.every((el) => !el.dataset.speaker)) {
        console.info("[render] no speaker markers applied to rendered lines", {
          lineCount: lineEls.length
        });
      }
    }
  } catch {
  }
  try {
    const firstLine = root.querySelector(".line");
    if (firstLine) {
      root.scrollTo({ top: 0, behavior: "auto" });
    }
  } catch {
  }
  try {
    const detail = { lineCount: renderedLineIndex };
    root.dispatchEvent(new CustomEvent("tp:render:done", { detail }));
    window.dispatchEvent(new CustomEvent("tp:render:done", { detail }));
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:script-rendered", { detail: { lineCount: renderedLineIndex } }));
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:scriptChanged", { detail: { lineCount: renderedLineIndex } }));
  } catch {
  }
}
try {
  window.renderScript = renderScript;
} catch {
}

// src/display-renderer.ts
try {
  if (typeof window.renderScript !== "function") {
    window.renderScript = renderScript;
  }
} catch {
}
try {
  window.__TP_RENDER_SCRIPT_READY = true;
} catch {
}
try {
  document.dispatchEvent(new CustomEvent("tp:renderScriptReady", { detail: { ready: true } }));
} catch {
}
//# sourceMappingURL=display-renderer.js.map
