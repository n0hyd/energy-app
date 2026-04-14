/* © 2022 Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S. 
* 
* Permission to use, copy, modify, and/or distribute this software for any 
* purpose with or without fee is hereby granted, provided that the above 
* copyright notice and this permission notice appear in all copies, unless 
* agreed otherwise. 
* 
* THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH 
* REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY 
* AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, 
* INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM 
* LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE 
* OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR 
* PERFORMANCE OF THIS SOFTWARE. 
* 
*/ 
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 602:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined)
        k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined)
        k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule)
        return mod;
    var result = {};
    if (mod != null)
        for (var k in mod)
            if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
                __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator)
        throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function (v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AvailablePlugins = exports.loadPlugins = void 0;
/**
 * A function that iterates through noted plugins and settings
 * and loads the retrieved plugins for engage. The plugins should be in form of functions.
 * @param settingsInput - The settings input from the developer
 */
function loadPlugins(settingsInput) {
    var e_1, _a;
    return __awaiter(this, void 0, void 0, function () {
        var count, availablePluginsKeys, requiredSettings, availablePluginsKeys_1, availablePluginsKeys_1_1, key, pluginValue, module, plugin, e_1_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    count = 0;
                    availablePluginsKeys = Object.keys(AvailablePlugins);
                    requiredSettings = {
                        clientKey: settingsInput.clientKey,
                        pointOfSale: settingsInput.pointOfSale,
                        targetURL: settingsInput.targetURL,
                    };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 8, 9, 14]);
                    availablePluginsKeys_1 = __asyncValues(availablePluginsKeys);
                    _b.label = 2;
                case 2: return [4 /*yield*/, availablePluginsKeys_1.next()];
                case 3:
                    if (!(availablePluginsKeys_1_1 = _b.sent(), !availablePluginsKeys_1_1.done))
                        return [3 /*break*/, 7];
                    key = availablePluginsKeys_1_1.value;
                    pluginValue = settingsInput[key];
                    if (!pluginValue)
                        return [3 /*break*/, 6];
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(__webpack_require__(895)("./".concat(AvailablePlugins[key], ".ts"))); })];
                case 4:
                    module = _b.sent();
                    plugin = module.default;
                    return [4 /*yield*/, plugin(pluginValue, requiredSettings)];
                case 5:
                    _b.sent();
                    count++;
                    _b.label = 6;
                case 6: return [3 /*break*/, 2];
                case 7: return [3 /*break*/, 14];
                case 8:
                    e_1_1 = _b.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 14];
                case 9:
                    _b.trys.push([9, , 12, 13]);
                    if (!(availablePluginsKeys_1_1 && !availablePluginsKeys_1_1.done && (_a = availablePluginsKeys_1.return)))
                        return [3 /*break*/, 11];
                    return [4 /*yield*/, _a.call(availablePluginsKeys_1)];
                case 10:
                    _b.sent();
                    _b.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    if (e_1)
                        throw e_1.error;
                    return [7 /*endfinally*/];
                case 13: return [7 /*endfinally*/];
                case 14: return [2 /*return*/, Promise.resolve("".concat(count, " plugins loaded"))];
            }
        });
    });
}
exports.loadPlugins = loadPlugins;
/**
 * enum with all available plugins
 * The path should be relative to the load-plugins.ts file
 * The name of each key should correspond to the property of the equivalent input setting
 */
var AvailablePlugins;
(function (AvailablePlugins) {
    AvailablePlugins["webPersonalization"] = "web-personalization";
})(AvailablePlugins = exports.AvailablePlugins || (exports.AvailablePlugins = {}));


/***/ }),

/***/ 355:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
var appendScriptWithAttributes_1 = __webpack_require__(832);
/**
 * Adds the functionality in order the web experiences library to work.
 * @param pluginConfiguration - The plugin configuration
 * @param requiredSettings - An object with basic input settings that are also required by the current
 * or any other plugin
 */
// eslint-disable-next-line import/no-default-export
function webPersonalization(pluginConfiguration, requiredSettings) {
    var _a, _b;
    if (!requiredSettings.pointOfSale)
        throw new Error('[MV-0003] "pointOfSale" is required.');
    if (requiredSettings.pointOfSale.trim().length === 0)
        throw new Error('[MV-0009] "pointOfSale" cannot be empty.');
    var webFlowTarget = 'https://d35vb5cccm4xzp.cloudfront.net';
    var webExperienceSettings = {
        /* eslint-disable @typescript-eslint/naming-convention */
        client_key: requiredSettings.clientKey,
        pointOfSale: requiredSettings.pointOfSale,
        targetURL: requiredSettings.targetURL,
        web_flow_config: {
            async: pluginConfiguration.asyncScriptLoading !== undefined
                ? pluginConfiguration.asyncScriptLoading
                : true,
            defer: (_a = pluginConfiguration.deferScriptLoading) !== null && _a !== void 0 ? _a : false,
        },
        web_flow_target: (_b = pluginConfiguration.baseURLOverride) !== null && _b !== void 0 ? _b : webFlowTarget,
    };
    window.Engage.settings = webExperienceSettings;
    // eslint-disable-next-line max-len
    var scriptSrcAttribute = "".concat(webExperienceSettings.web_flow_target, "/web-flow-libs/").concat(webExperienceSettings.client_key, "/web-version.min.js");
    (0, appendScriptWithAttributes_1.appendScriptWithAttributes)({ async: webExperienceSettings.web_flow_config.async, src: scriptSrcAttribute });
}
exports["default"] = webPersonalization;


/***/ }),

/***/ 993:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.init = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var events_1 = __webpack_require__(975);
var personalizer_1 = __webpack_require__(739);
var callflow_cdp_client_1 = __webpack_require__(744);
var cookie_utils_1 = __webpack_require__(181);
var browser_cookie_handler_1 = __webpack_require__(184);
var settings_1 = __webpack_require__(881);
var EventApiClient_1 = __webpack_require__(791);
var load_plugins_1 = __webpack_require__(602);
var get_browser_id_1 = __webpack_require__(945);
var infer_1 = __webpack_require__(26);
var get_guest_id_1 = __webpack_require__(996);
var eventStorage_1 = __webpack_require__(128);
var consts_1 = __webpack_require__(968);
/**
 * Initiates the Engage library using the global settings added by the developer
 * @param settingsInput - Global settings added by the developer
 * @returns A promise that resolves with an object that handles the library functionality
 */
function init(settingsInput) {
    return __awaiter(this, void 0, Promise, function () {
        var settings, id, eventApiClient, infer, queue, callFlowCDPClient;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (typeof window === 'undefined') {
                        throw new Error(
                        // eslint-disable-next-line max-len
                        "[IE-0001] The \"window\" object is not available on the server side. Use the \"window\" object only on the client side, and in the correct execution context.");
                    }
                    settings = (0, settings_1.createSettings)(settingsInput);
                    if (!settings.cookieSettings.forceServerCookieMode)
                        (0, browser_cookie_handler_1.replaceObsoleteCookieNamePrefixes)(settings.cookieSettings);
                    if (!(!settings.cookieSettings.forceServerCookieMode &&
                        !(0, cookie_utils_1.cookieExists)(window.document.cookie, settings.cookieSettings.cookieName)))
                        return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, browser_cookie_handler_1.createCookie)(settings.targetURL, settings.clientKey, settings.cookieSettings)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    id = (0, get_browser_id_1.getBrowserId)(settings.cookieSettings.cookieName);
                    eventApiClient = new EventApiClient_1.EventApiClient(settings.targetURL, consts_1.API_VERSION);
                    window.Engage = {};
                    return [4 /*yield*/, (0, load_plugins_1.loadPlugins)(settingsInput)];
                case 3:
                    _a.sent();
                    window.Engage = __assign(__assign({}, window.Engage), { getBrowserId: function () { return (0, get_browser_id_1.getBrowserId)(settings.cookieSettings.cookieName); }, version: consts_1.LIBRARY_VERSION });
                    infer = new infer_1.Infer();
                    queue = new eventStorage_1.EventQueue(sessionStorage, eventApiClient, infer);
                    callFlowCDPClient = new callflow_cdp_client_1.CallFlowCDPClient(settings);
                    return [2 /*return*/, {
                            addToEventQueue: function (type, eventData, extensionData) {
                                var queueEventPayload = {
                                    eventData: eventData,
                                    extensionData: extensionData,
                                    id: id,
                                    settings: settings,
                                    type: type,
                                };
                                queue.enqueueEvent(queueEventPayload);
                            },
                            clearEventQueue: function () {
                                queue.clearQueue();
                            },
                            event: function (type, eventData, extensionData) {
                                return new events_1.CustomEvent({
                                    eventApiClient: eventApiClient,
                                    eventData: eventData,
                                    extensionData: extensionData,
                                    id: id,
                                    infer: infer,
                                    settings: settings,
                                    type: type,
                                }).send();
                            },
                            form: function (formId, interactionType, pointOfSale) {
                                var undefinedInfer = {
                                    language: function () { return undefined; },
                                    pageName: function () { return undefined; },
                                };
                                return new events_1.CustomEvent({
                                    eventApiClient: eventApiClient,
                                    eventData: { pointOfSale: pointOfSale },
                                    extensionData: {
                                        formId: formId,
                                        interactionType: interactionType.toUpperCase(),
                                    },
                                    id: id,
                                    infer: undefinedInfer,
                                    settings: settings,
                                    type: 'FORM',
                                }).send();
                            },
                            getBrowserId: function () { return (0, get_browser_id_1.getBrowserId)(settings.cookieSettings.cookieName); },
                            getGuestId: function () { return (0, get_guest_id_1.getGuestId)(id, settings.targetURL, settings.clientKey); },
                            identity: function (eventData, extensionData) {
                                return new events_1.IdentityEvent({
                                    eventApiClient: eventApiClient,
                                    eventData: eventData,
                                    extensionData: extensionData,
                                    id: id,
                                    infer: infer,
                                    settings: settings,
                                }).send();
                            },
                            pageView: function (eventData, extensionData) {
                                return new events_1.PageViewEvent({
                                    eventApiClient: eventApiClient,
                                    eventData: eventData,
                                    extensionData: extensionData,
                                    id: id,
                                    infer: infer,
                                    searchParams: window.location.search,
                                    settings: settings,
                                }).send();
                            },
                            personalize: function (personalizeData, timeout) {
                                return new personalizer_1.Personalizer(callFlowCDPClient, id, infer).getInteractiveExperienceData(personalizeData, timeout);
                            },
                            processEventQueue: function () { return queue.sendAllEvents(); },
                            updatePointOfSale: function (pointOfSale) { return (0, settings_1.updatePointOfSale)(pointOfSale, settings); },
                            version: consts_1.LIBRARY_VERSION,
                        }];
            }
        });
    });
}
exports.init = init;


/***/ }),

/***/ 832:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.appendScriptWithAttributes = void 0;
function appendScriptWithAttributes(attributes) {
    var sdkScriptElement = document.createElement('script');
    sdkScriptElement.type = 'text/javascript';
    sdkScriptElement.src = attributes.src;
    sdkScriptElement.async = attributes.async;
    document.head.appendChild(sdkScriptElement);
}
exports.appendScriptWithAttributes = appendScriptWithAttributes;


/***/ }),

/***/ 791:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EventApiClient = void 0;
var consts_1 = __webpack_require__(968);
var EventApiClient = /** @class */ (function () {
    function EventApiClient(targetURL, apiVersion) {
        this.targetURL = targetURL;
        this.apiVersion = apiVersion;
        this.eventUrl = "".concat(this.targetURL, "/").concat(this.apiVersion, "/").concat(consts_1.EndPoint.Events);
    }
    /**
     * A function that sends the payload to Sitecore CDP
     * @param body - The Request body for the Sitecore CDP
     * @returns - A promise that resolves with either the Sitecore CDP response object or null
     */
    EventApiClient.prototype.send = function (body) {
        return __awaiter(this, void 0, Promise, function () {
            var fetchOptions;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fetchOptions = {
                            body: JSON.stringify(body),
                            headers: {
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                'Content-Type': 'application/json',
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                'X-Library-Version': consts_1.LIBRARY_VERSION,
                            },
                            method: 'POST',
                        };
                        return [4 /*yield*/, fetch(this.eventUrl, fetchOptions)
                                .then(function (response) { return response.json(); })
                                .then(function (data) { return data; })
                                .catch(function () { return null; })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return EventApiClient;
}());
exports.EventApiClient = EventApiClient;


/***/ }),

/***/ 184:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.replaceObsoleteCookieNamePrefixes = exports.createCookie = exports.getCookieValue = void 0;
var consts_1 = __webpack_require__(968);
var cookie_utils_1 = __webpack_require__(181);
var get_browser_id_from_cdp_1 = __webpack_require__(920);
/**
 * Gets the value for a given cookie name
 * @param cookieName - The cookie name to be found
 * @returns - The value of the cookie if it exists or empty string
 */
function getCookieValue(cookieName) {
    var _a;
    var cookie = (0, cookie_utils_1.getCookie)(document.cookie, cookieName);
    return (_a = cookie === null || cookie === void 0 ? void 0 : cookie.value) !== null && _a !== void 0 ? _a : '';
}
exports.getCookieValue = getCookieValue;
/**
 * Creates and adds the cookie to the document
 * @param targetURL - The targetURL from global settings
 * @param clientKey - The clientKey from global settings
 * @param settings - The ICookieSettings settings object
 * @returns - browserId or undefined on error
 */
function createCookie(targetURL, clientKey, settings) {
    return __awaiter(this, void 0, Promise, function () {
        var browserId, attributes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, get_browser_id_from_cdp_1.getBrowserIdFromCdp)(targetURL, clientKey)];
                case 1:
                    browserId = _a.sent();
                    attributes = (0, cookie_utils_1.getDefaultCookieAttributes)(settings.cookieExpiryDays, settings.cookieDomain);
                    document.cookie = (0, cookie_utils_1.createCookieString)(settings.cookieName, browserId, attributes);
                    return [2 /*return*/, browserId];
            }
        });
    });
}
exports.createCookie = createCookie;
/**
 * Replaces the obsolete cookies starting with BID_ with new ones starting with bid_ keeping the same value.
 * @param cookieStr - The cookie string containing every cookie
 * @param settings - The ICookieSettings settings object
 */
function replaceObsoleteCookieNamePrefixes(settings) {
    var obsoleteCookies = (0, cookie_utils_1.filterCookiesByPrefix)(document.cookie, 'BID_');
    obsoleteCookies.forEach(function (obsoleteCookie) {
        (0, cookie_utils_1.deleteCookie)(obsoleteCookie.name);
        var newCookie = {
            name: obsoleteCookie.name.replace('BID_', consts_1.BID_PREFIX),
            value: obsoleteCookie.value,
        };
        var cookieAttributes = (0, cookie_utils_1.getDefaultCookieAttributes)(settings.cookieExpiryDays, settings.cookieDomain);
        document.cookie = (0, cookie_utils_1.createCookieString)(newCookie.name, newCookie.value, cookieAttributes);
    });
}
exports.replaceObsoleteCookieNamePrefixes = replaceObsoleteCookieNamePrefixes;


/***/ }),

/***/ 945:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBrowserId = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var browser_cookie_handler_1 = __webpack_require__(184);
/**
 * Get the browser ID from the cookie
 * @param cookieName - The cookie name from global settings
 * @returns The browser ID if the cookie exists
 */
function getBrowserId(cookieName) {
    return (0, browser_cookie_handler_1.getCookieValue)(cookieName);
}
exports.getBrowserId = getBrowserId;


/***/ }),

/***/ 128:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EventQueue = void 0;
var index_1 = __webpack_require__(975);
var EventQueue = /** @class */ (function () {
    function EventQueue(storage, eventApiClient, infer) {
        this.storage = storage;
        this.eventApiClient = eventApiClient;
        this.infer = infer;
        /**
         * Initialize the Event Storage
         * @param storage - Interface that describes the storage functionality
         * @param eventApiClient - The API client which sends events to CDP
         * @param infer - The instance of the infer class
         */
        this.key = 'EngageEventQueue';
    }
    /** Returns the stored array of data with type QueueEventPayload, or empty array if the given key does not exist. */
    EventQueue.prototype.getEventQueue = function () {
        var storedQueue = this.storage.getItem(this.key);
        if (!storedQueue)
            return [];
        try {
            var parsedQueueEvent = JSON.parse(storedQueue);
            return Array.isArray(parsedQueueEvent) ? parsedQueueEvent : [];
        }
        catch (_a) {
            return [];
        }
    };
    /**
     * Adds the required event data to the queue and stores it in the storage.
     * @param queueEventPayload - The required event data for the creation of a CustomEvent.
     * Performs validation by creating a new CustomEvent.
     */
    EventQueue.prototype.enqueueEvent = function (queueEventPayload) {
        var _a, _b;
        queueEventPayload.eventData.page = (_a = queueEventPayload.eventData.page) !== null && _a !== void 0 ? _a : this.infer.pageName();
        queueEventPayload.eventData.language = (_b = queueEventPayload.eventData.language) !== null && _b !== void 0 ? _b : this.infer.language();
        new index_1.CustomEvent(__assign({ eventApiClient: this.eventApiClient, infer: this.infer }, queueEventPayload));
        var eventQueue = this.getEventQueue();
        eventQueue.push(queueEventPayload);
        this.storage.setItem(this.key, JSON.stringify(eventQueue));
    };
    /**
     * Iterates the queue, and sends sequently the custom events to Sitecore CDP.
     */
    EventQueue.prototype.sendAllEvents = function () {
        return __awaiter(this, void 0, void 0, function () {
            var eventQueue, _i, eventQueue_1, queueEventPayload;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        eventQueue = this.getEventQueue();
                        _i = 0, eventQueue_1 = eventQueue;
                        _a.label = 1;
                    case 1:
                        if (!(_i < eventQueue_1.length))
                            return [3 /*break*/, 4];
                        queueEventPayload = eventQueue_1[_i];
                        return [4 /*yield*/, new index_1.CustomEvent({
                                eventApiClient: this.eventApiClient,
                                eventData: queueEventPayload.eventData,
                                extensionData: queueEventPayload.extensionData,
                                id: queueEventPayload.id,
                                infer: this.infer,
                                settings: queueEventPayload.settings,
                                type: queueEventPayload.type,
                            }).send()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        this.clearQueue();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Clears the queue from storage.
     */
    EventQueue.prototype.clearQueue = function () {
        this.storage.removeItem(this.key);
    };
    return EventQueue;
}());
exports.EventQueue = EventQueue;


/***/ }),

/***/ 79:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BaseEvent = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var get_point_of_sale_1 = __webpack_require__(352);
var BaseEvent = /** @class */ (function () {
    /**
     * The base event class that has all the shared functions between Events
     * @param baseEventData - The event data to send
     * @param settings - The global settings
     * @param id - The browser id
     * @param infer - The source of methods to estimate language and page parameters
     */
    function BaseEvent(baseEventData, settings, id, infer) {
        var _a, _b;
        this.baseEventData = baseEventData;
        this.settings = settings;
        this.infer = infer;
        this.pointOfSale = (0, get_point_of_sale_1.getPointOfSale)(this.baseEventData.pointOfSale || settings.pointOfSale);
        this.browserId = id;
        this.language = (_a = this.baseEventData.language) !== null && _a !== void 0 ? _a : (this.infer ? this.infer.language() : '');
        this.page = (_b = this.baseEventData.page) !== null && _b !== void 0 ? _b : (this.infer ? this.infer.pageName() : '');
    }
    /**
     *  A function that returns the properties for sending events to Sitecore CDP
     * @returns an object that is required
     */
    BaseEvent.prototype.mapBaseEventPayload = function () {
        return {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            browser_id: this.browserId,
            channel: this.baseEventData.channel,
            /* eslint-disable @typescript-eslint/naming-convention */
            client_key: this.settings.clientKey,
            currency: this.baseEventData.currency,
            language: this.language,
            page: this.page,
            pos: this.pointOfSale,
        };
    };
    return BaseEvent;
}());
exports.BaseEvent = BaseEvent;


/***/ }),

/***/ 153:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b)
                if (Object.prototype.hasOwnProperty.call(b, p))
                    d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s)
        if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CustomEvent = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var flatten_object_1 = __webpack_require__(614);
var base_event_1 = __webpack_require__(79);
var consts_1 = __webpack_require__(968);
var CustomEvent = /** @class */ (function (_super) {
    __extends(CustomEvent, _super);
    /**
     * A class that extends from {@link BaseEvent} and has all the required functionality to send a VIEW event
     * @param args - Unified object containing the required properties
     */
    function CustomEvent(args) {
        var _this = this;
        var _a = args.eventData, channel = _a.channel, currency = _a.currency, pointOfSale = _a.pointOfSale, language = _a.language, page = _a.page, rest = __rest(_a, ["channel", "currency", "pointOfSale", "language", "page"]);
        _this = _super.call(this, { channel: channel, currency: currency, language: language, page: page, pointOfSale: pointOfSale }, args.settings, args.id, args.infer) || this;
        _this.extensionData = {};
        _this.eventApiClient = args.eventApiClient;
        _this.customEventPayload = __assign({ type: args.type }, rest);
        if (args.extensionData)
            _this.extensionData = (0, flatten_object_1.flattenObject)({ object: args.extensionData });
        var numberOfExtensionDataProperties = Object.entries(_this.extensionData).length;
        if (numberOfExtensionDataProperties > consts_1.MAX_EXT_ATTRIBUTES)
            throw new Error("[IV-0005] This event supports maximum ".concat(consts_1.MAX_EXT_ATTRIBUTES, " attributes. Reduce the number of attributes."));
        if (numberOfExtensionDataProperties > 0)
            _this.customEventPayload.ext = _this.extensionData;
        return _this;
    }
    /**
     * Sends the event to Sitecore CDP
     * @returns - A promise that resolves with either the Sitecore CDP response object or null
     */
    CustomEvent.prototype.send = function () {
        return __awaiter(this, void 0, Promise, function () {
            var baseAttr, fetchBody;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        baseAttr = this.mapBaseEventPayload();
                        fetchBody = Object.assign({}, this.customEventPayload, baseAttr);
                        return [4 /*yield*/, this.eventApiClient.send(fetchBody)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return CustomEvent;
}(base_event_1.BaseEvent));
exports.CustomEvent = CustomEvent;


/***/ }),

/***/ 182:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b)
                if (Object.prototype.hasOwnProperty.call(b, p))
                    d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.IdentityEvent = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var consts_1 = __webpack_require__(968);
var date_checker_1 = __webpack_require__(795);
var email_validator_1 = __webpack_require__(11);
var base_event_1 = __webpack_require__(79);
var flatten_object_1 = __webpack_require__(614);
var IdentityEvent = /** @class */ (function (_super) {
    __extends(IdentityEvent, _super);
    /**
     * A class that extends from {@link BaseEvent} and has all the required functionality to send a VIEW event
     * @param args - Unified object containing the required properties
     */
    function IdentityEvent(args) {
        var _this = this;
        var _a = args.eventData, channel = _a.channel, currency = _a.currency, pointOfSale = _a.pointOfSale, language = _a.language, page = _a.page;
        _this = _super.call(this, { channel: channel, currency: currency, language: language, page: page, pointOfSale: pointOfSale }, args.settings, args.id, args.infer) || this;
        _this.extensionData = {};
        _this.numberOfExtensionDataProperties = 0;
        _this.validateAttributes(args.eventData);
        _this.eventData = args.eventData;
        _this.eventApiClient = args.eventApiClient;
        if (args.extensionData)
            _this.extensionData = (0, flatten_object_1.flattenObject)({ object: args.extensionData });
        _this.numberOfExtensionDataProperties = Object.entries(_this.extensionData).length;
        if (_this.numberOfExtensionDataProperties > consts_1.MAX_EXT_ATTRIBUTES)
            throw new Error("[IV-0005] This event supports maximum ".concat(consts_1.MAX_EXT_ATTRIBUTES, " attributes. Reduce the number of attributes."));
        return _this;
    }
    /**
     * Function that validates the identifiers object, email and date attributes for CDN users
     *  * @param eventData - The data to be validated
     */
    IdentityEvent.prototype.validateAttributes = function (eventData) {
        if (eventData.identifiers.length === 0)
            throw new Error("[MV-0004] \"identifiers\" is required.");
        if (eventData.dob !== undefined && !(0, date_checker_1.isShortISODateString)(eventData.dob))
            throw new Error("[IV-0002] Incorrect value for \"dob\". Format the value according to ISO 8601.");
        eventData.identifiers.forEach(function (identifier) {
            if (identifier.expiryDate && !(0, date_checker_1.isShortISODateString)(identifier.expiryDate))
                throw new Error("[IV-0004] Incorrect value for \"expiryDate\". Format the value according to ISO 8601.");
        });
        if (eventData.email && !(0, email_validator_1.isValidEmail)(eventData.email))
            throw new Error("[IV-0003] Incorrect value for \"email\". Set the value to a valid email address.");
    };
    /**
     * A function that maps the identity event input data with the payload sent to the API
     * @returns - The payload object
     */
    IdentityEvent.prototype.mapAttributes = function () {
        var identityPayload = {
            city: this.eventData.city,
            country: this.eventData.country,
            dob: this.eventData.dob,
            email: this.eventData.email,
            firstname: this.eventData.firstName,
            gender: this.eventData.gender,
            identifiers: this.eventData.identifiers.map(function (value) {
                return {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    expiry_date: value.expiryDate,
                    id: value.id,
                    provider: value.provider,
                };
            }),
            lastname: this.eventData.lastName,
            mobile: this.eventData.mobile,
            phone: this.eventData.phone,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            postal_code: this.eventData.postalCode,
            state: this.eventData.state,
            street: this.eventData.street,
            title: this.eventData.title,
            type: consts_1.EventTypes.Identity,
        };
        if (this.numberOfExtensionDataProperties > 0)
            identityPayload.ext = this.extensionData;
        return identityPayload;
    };
    /**
     * Sends the event to Sitecore CDP
     * @returns - A promise that resolves with either the Sitecore CDP response object or null
     */
    IdentityEvent.prototype.send = function () {
        return __awaiter(this, void 0, Promise, function () {
            var baseAttr, eventAttrs, fetchBody;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        baseAttr = this.mapBaseEventPayload();
                        eventAttrs = this.mapAttributes();
                        fetchBody = Object.assign({}, eventAttrs, baseAttr);
                        return [4 /*yield*/, this.eventApiClient.send(fetchBody)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return IdentityEvent;
}(base_event_1.BaseEvent));
exports.IdentityEvent = IdentityEvent;


/***/ }),

/***/ 975:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.IdentityEvent = exports.CustomEvent = exports.PageViewEvent = exports.BaseEvent = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var base_event_1 = __webpack_require__(79);
Object.defineProperty(exports, "BaseEvent", ({ enumerable: true, get: function () { return base_event_1.BaseEvent; } }));
var page_view_event_1 = __webpack_require__(966);
Object.defineProperty(exports, "PageViewEvent", ({ enumerable: true, get: function () { return page_view_event_1.PageViewEvent; } }));
var custom_event_1 = __webpack_require__(153);
Object.defineProperty(exports, "CustomEvent", ({ enumerable: true, get: function () { return custom_event_1.CustomEvent; } }));
var identity_event_1 = __webpack_require__(182);
Object.defineProperty(exports, "IdentityEvent", ({ enumerable: true, get: function () { return identity_event_1.IdentityEvent; } }));


/***/ }),

/***/ 966:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b)
                if (Object.prototype.hasOwnProperty.call(b, p))
                    d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PageViewEvent = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var consts_1 = __webpack_require__(968);
var base_event_1 = __webpack_require__(79);
var flatten_object_1 = __webpack_require__(614);
var PageViewEvent = /** @class */ (function (_super) {
    __extends(PageViewEvent, _super);
    /**
     * A class that extends from {@link BaseEvent} and has all the required functionality to send a VIEW event
     * @param args - Unified object containing the required properties
     */
    function PageViewEvent(args) {
        var _this = this;
        var _a = args.eventData, channel = _a.channel, currency = _a.currency, pointOfSale = _a.pointOfSale, language = _a.language, page = _a.page;
        _this = _super.call(this, {
            channel: channel,
            currency: currency,
            language: language,
            page: page,
            pointOfSale: pointOfSale,
        }, args.settings, args.id, args.infer) || this;
        _this.extensionData = {};
        _this.eventData = args.eventData;
        _this.urlSearchParams = new URLSearchParams(decodeURI(args.searchParams));
        if (args.extensionData)
            _this.extensionData = (0, flatten_object_1.flattenObject)({ object: args.extensionData });
        var numberOfExtensionDataProperties = Object.entries(_this.extensionData).length;
        if (numberOfExtensionDataProperties > consts_1.MAX_EXT_ATTRIBUTES)
            throw new Error("[IV-0005] This event supports maximum ".concat(consts_1.MAX_EXT_ATTRIBUTES, " attributes. Reduce the number of attributes."));
        _this.eventApiClient = args.eventApiClient;
        return _this;
    }
    /**
     * Retrieves UTM parameters from the url query string
     * @returns - an object containing the UTM parameters if they exists
     */
    PageViewEvent.prototype.getUTMParameters = function () {
        var utmParameters = {};
        this.urlSearchParams.forEach(function (value, key) {
            var param = key.toLowerCase();
            if (param.indexOf(consts_1.UTM_PREFIX) === 0)
                utmParameters[param] = value;
        });
        return utmParameters;
    };
    /**
     * Gets the variant ID from the url if not passed by the developer
     * Gets the variant ID from the extension data if not found from the url
     * @returns - variant ID or null
     */
    PageViewEvent.prototype.getPageVariantId = function (pageVariantIdFromEventData, pageVariantIdFromExt) {
        if (pageVariantIdFromEventData)
            return pageVariantIdFromEventData;
        var pageVariantIdFromURL = this.urlSearchParams.get('variantid');
        if (pageVariantIdFromURL)
            return pageVariantIdFromURL;
        if (pageVariantIdFromExt)
            return pageVariantIdFromExt;
        return null;
    };
    /**
     * Returns the referrer if exists on page view event else null if we are on server and no referrer is on event, else
     * returns the href if on client side and the document referrer is different from the window location hostname
     * @returns - the referrer
     */
    PageViewEvent.prototype.getReferrer = function () {
        if (this.eventData.referrer)
            return this.eventData.referrer;
        if (typeof window === 'undefined')
            return null;
        if (!PageViewEvent.isFirstPageView || !document.referrer)
            return null;
        var _a = new URL(document.referrer), hostname = _a.hostname, href = _a.href;
        return window.location.hostname !== hostname ? href : null;
    };
    /**
     * Maps parameters given as input to corresponding attributes send to the API
     * @returns the mapped object to be sent as payload
     */
    PageViewEvent.prototype.mapAttributes = function () {
        var viewPayload = {
            type: consts_1.EventTypes.View,
        };
        if (this.settings.includeUTMParameters) {
            var utmParameters = this.getUTMParameters();
            viewPayload = __assign(__assign({}, viewPayload), utmParameters);
        }
        var pageVariantId = this.getPageVariantId(this.eventData.pageVariantId, this.extensionData['pageVariantId']);
        if (pageVariantId !== null)
            viewPayload.ext = __assign(__assign({}, viewPayload.ext), { pageVariantId: pageVariantId });
        if (Object.keys(this.extensionData).length > 0) {
            delete this.extensionData['pageVariantId'];
            viewPayload.ext = __assign(__assign({}, viewPayload.ext), this.extensionData);
        }
        var referrer = this.getReferrer();
        if (referrer !== null)
            viewPayload = __assign(__assign({}, viewPayload), { referrer: referrer });
        return viewPayload;
    };
    /**
     * Sends the event to Sitecore CDP
     * @returns - A promise that resolves with either the Sitecore CDP response object or null
     */
    PageViewEvent.prototype.send = function () {
        return __awaiter(this, void 0, Promise, function () {
            var baseAttr, eventAttrs, fetchBody;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        baseAttr = this.mapBaseEventPayload();
                        eventAttrs = this.mapAttributes();
                        fetchBody = Object.assign({}, eventAttrs, baseAttr);
                        PageViewEvent.isFirstPageView = false;
                        return [4 /*yield*/, this.eventApiClient.send(fetchBody)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    PageViewEvent.isFirstPageView = true;
    return PageViewEvent;
}(base_event_1.BaseEvent));
exports.PageViewEvent = PageViewEvent;


/***/ }),

/***/ 26:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Infer = void 0;
/**
 * A class that includes all the inferrer functionality of the library
 */
var Infer = /** @class */ (function () {
    function Infer() {
    }
    /**
     * Returns the uppercase language code of the current web page's root HTML element, using the "lang" attribute.
     * If unavailable or invalid, an empty string is returned.
     * @returns - Language attribute or empty string
     */
    Infer.prototype.language = function () {
        return window.document.documentElement.lang.length > 1
            ? new Intl.Locale(window.document.documentElement.lang).language.toLocaleUpperCase()
            : '';
    };
    /**
     * Returns the name of the current page extracted from the URL's pathname.
     * If it's the home page, it returns 'Home Page'.
     * @returns - Home Page if root or pathname
     */
    Infer.prototype.pageName = function () {
        return window.location.pathname === '/' ? 'Home Page' : window.location.pathname.split('/').pop();
    };
    return Infer;
}());
exports.Infer = Infer;


/***/ }),

/***/ 744:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CallFlowCDPClient = void 0;
var url_builder_1 = __webpack_require__(206);
var fetch_with_timeout_1 = __webpack_require__(295);
var consts_1 = __webpack_require__(968);
var CallFlowCDPClient = /** @class */ (function () {
    /**
     * A helper class which handles the functionality for sending CALLFLOW requests
     * @param personalizeData - The mandatory payload to be send to Sitecore CDP
     * @param settings - The global settings
     */
    function CallFlowCDPClient(settings) {
        this.settings = settings;
    }
    /**
     * A function that sends a CallFlow request to Sitecore CDP
     * @param personalizeData - Properties to be send to Sitecore CDP
     * @param timeout - Optional timeout in milliseconds to cancel the request
     * @returns - A promise that resolves with either the Sitecore CDP response object or unknown
     */
    CallFlowCDPClient.prototype.sendCallFlowsRequest = function (cdpCallFlowsBody, timeout) {
        return __awaiter(this, void 0, void 0, function () {
            var requestUrl, fetchOptions;
            return __generator(this, function (_a) {
                requestUrl = (0, url_builder_1.generateCallFlowUrl)(this.settings.targetURL);
                fetchOptions = {
                    body: JSON.stringify(cdpCallFlowsBody),
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'Content-Type': 'application/json',
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'X-Library-Version': consts_1.LIBRARY_VERSION,
                    },
                    method: 'POST',
                };
                if (timeout === undefined)
                    return [2 /*return*/, fetch(requestUrl, fetchOptions)
                            .then(function (response) { return response.json(); })
                            .then(function (data) { return data; })
                            .catch(function () {
                            return null;
                        })];
                return [2 /*return*/, (0, fetch_with_timeout_1.fetchWithTimeout)(requestUrl, timeout, fetchOptions)];
            });
        });
    };
    return CallFlowCDPClient;
}());
exports.CallFlowCDPClient = CallFlowCDPClient;


/***/ }),

/***/ 739:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Personalizer = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var flatten_object_1 = __webpack_require__(614);
var get_point_of_sale_1 = __webpack_require__(352);
var Personalizer = /** @class */ (function () {
    /**
     * The Personalizer Class runs a flow of interactive experiments.
     * @param personalizeClient - The data to be send to Sitecore CDP
     * @param infer - The source of methods to estimate language and page parameters
     */
    function Personalizer(personalizeClient, id, infer) {
        this.personalizeClient = personalizeClient;
        this.id = id;
        this.infer = infer;
    }
    /**
     * A function to make a request to the Sitecore CDP /callFlows API endpoint
     * @param timeout - Optional timeout in milliseconds to cancel the request
     * @returns - A promise that resolves with either the Sitecore CDP response object or null
     */
    Personalizer.prototype.getInteractiveExperienceData = function (personalizeInput, timeout) {
        return __awaiter(this, void 0, Promise, function () {
            var sanitizedInput, mappedData, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.validate(personalizeInput);
                        sanitizedInput = this.sanitizeInput(personalizeInput);
                        mappedData = this.mapPersonalizeInputToCDPData(sanitizedInput);
                        if (!mappedData.email && !mappedData.identifiers)
                            mappedData.browserId = this.id;
                        return [4 /*yield*/, this.personalizeClient.sendCallFlowsRequest(mappedData, timeout)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    /**
     * A function that sanitizes the personalize input data
     * @returns - The sanitized object
     */
    Personalizer.prototype.sanitizeInput = function (personalizerInput) {
        var sanitizedInput = {
            channel: personalizerInput.channel,
            currency: personalizerInput.currency,
            friendlyId: personalizerInput.friendlyId,
            language: personalizerInput.language,
            pointOfSale: (0, get_point_of_sale_1.getPointOfSale)(personalizerInput.pointOfSale || this.personalizeClient.settings.pointOfSale),
        };
        if (personalizerInput.identifier &&
            personalizerInput.identifier.id &&
            personalizerInput.identifier.id.trim().length > 0)
            sanitizedInput.identifier = personalizerInput.identifier;
        if (personalizerInput.email && personalizerInput.email.trim().length > 0)
            sanitizedInput.email = personalizerInput.email;
        if (personalizerInput.params && Object.keys(personalizerInput.params).length > 0)
            sanitizedInput.params = (0, flatten_object_1.flattenObject)({ object: personalizerInput.params });
        return sanitizedInput;
    };
    /**
     * A function that maps the personalize input data with the CDP
     * @returns - The CDP object
     */
    Personalizer.prototype.mapPersonalizeInputToCDPData = function (input) {
        var _a, _b, _c;
        var mappedData = {
            channel: input.channel,
            clientKey: this.personalizeClient.settings.clientKey,
            currencyCode: input.currency,
            email: input.email,
            friendlyId: input.friendlyId,
            identifiers: input.identifier,
            language: (_c = (_a = input.language) !== null && _a !== void 0 ? _a : (_b = this.infer) === null || _b === void 0 ? void 0 : _b.language()) !== null && _c !== void 0 ? _c : '',
            params: input.params,
            pointOfSale: input.pointOfSale,
        };
        return mappedData;
    };
    /**
     * A validation method to throw error for the mandatory property for runtime users
     */
    Personalizer.prototype.validate = function (_a) {
        var friendlyId = _a.friendlyId;
        if (!friendlyId || friendlyId.trim().length === 0)
            throw new Error("[MV-0008] \"friendlyId\" is required.");
    };
    return Personalizer;
}());
exports.Personalizer = Personalizer;


/***/ }),

/***/ 881:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.updatePointOfSale = exports.validateSettings = exports.createSettings = void 0;
var consts_1 = __webpack_require__(968);
/**
 * Creates the global settings object, to be used by the library
 * @param settingsInput - Global settings added by the developer.
 * @returns an ISettings with the settings added by the developer
 */
function createSettings(settingsInput) {
    validateSettings(settingsInput);
    var clientKey = settingsInput.clientKey, targetURL = settingsInput.targetURL, cookieDomain = settingsInput.cookieDomain, cookiePath = settingsInput.cookiePath, cookieExpiryDays = settingsInput.cookieExpiryDays, forceServerCookieMode = settingsInput.forceServerCookieMode, includeUTMParameters = settingsInput.includeUTMParameters, pointOfSale = settingsInput.pointOfSale;
    return {
        clientKey: clientKey,
        cookieSettings: {
            cookieDomain: cookieDomain,
            cookieExpiryDays: cookieExpiryDays || consts_1.DEFAULT_COOKIE_EXPIRY_DAYS,
            cookieName: "".concat(consts_1.BID_PREFIX).concat(clientKey),
            cookiePath: cookiePath || '/',
            forceServerCookieMode: forceServerCookieMode !== null && forceServerCookieMode !== void 0 ? forceServerCookieMode : false,
        },
        includeUTMParameters: includeUTMParameters !== null && includeUTMParameters !== void 0 ? includeUTMParameters : true,
        pointOfSale: pointOfSale !== null && pointOfSale !== void 0 ? pointOfSale : undefined,
        targetURL: targetURL,
    };
}
exports.createSettings = createSettings;
/**
 * A validation function for the required global settings
 */
function validateSettings(settings) {
    var clientKey = settings.clientKey, targetURL = settings.targetURL, pointOfSale = settings.pointOfSale;
    if (!clientKey)
        throw new Error("[MV-0001] \"clientKey\" is required.");
    if (!targetURL)
        throw new Error("[MV-0002] \"targetURL\" is required.");
    if (pointOfSale && pointOfSale.trim().length === 0)
        throw new Error('[MV-0009] "pointOfSale" cannot be empty.');
    try {
        new URL(targetURL);
    }
    catch (e) {
        throw new Error("[IV-0001] Incorrect value for \"targetURL\". Set the value to a valid URL string.");
    }
}
exports.validateSettings = validateSettings;
/**
 * A function that updates Point of sale in init settings object and in the Window.Engage object
 */
function updatePointOfSale(pointOfSale, settings) {
    if (pointOfSale && pointOfSale.trim().length > 0) {
        if (window && window['Engage'] && window['Engage'].settings) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            window['Engage'].settings.pointOfSale = pointOfSale;
        }
        settings.pointOfSale = pointOfSale;
    }
    else {
        throw new Error('[MV-0009] "pointOfSale" cannot be empty.');
    }
}
exports.updatePointOfSale = updatePointOfSale;


/***/ }),

/***/ 968:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EventTypes = exports.EndPoint = exports.MAX_EXT_ATTRIBUTES = exports.BID_PREFIX = exports.UTM_PREFIX = exports.CALLFLOW_API_VERSION = exports.API_VERSION = exports.DAILY_SECONDS = exports.DEFAULT_COOKIE_EXPIRY_DAYS = exports.LIBRARY_VERSION = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var package_json_1 = __importDefault(__webpack_require__(147));
exports.LIBRARY_VERSION = package_json_1.default.version;
exports.DEFAULT_COOKIE_EXPIRY_DAYS = 730;
exports.DAILY_SECONDS = 86400;
exports.API_VERSION = 'v1.2';
exports.CALLFLOW_API_VERSION = 'v2';
exports.UTM_PREFIX = 'utm_';
exports.BID_PREFIX = 'bid_';
exports.MAX_EXT_ATTRIBUTES = 50;
var EndPoint;
(function (EndPoint) {
    EndPoint["Events"] = "events";
    EndPoint["Browser"] = "browser";
    EndPoint["Batches"] = "batches";
    EndPoint["CallFlows"] = "callFlows";
})(EndPoint = exports.EndPoint || (exports.EndPoint = {}));
var EventTypes;
(function (EventTypes) {
    EventTypes["Add"] = "ADD";
    EventTypes["AddConsumers"] = "ADD_CONSUMERS";
    EventTypes["AddContacts"] = "ADD_CONTACTS";
    EventTypes["AddProduct"] = "ADD_PRODUCT";
    EventTypes["Calculator"] = "CALCULATOR";
    EventTypes["CampaignTracking"] = "CAMPAIGN_TRACKING";
    EventTypes["ClearCart"] = "CLEAR_CART";
    EventTypes["Click"] = "CLICK";
    EventTypes["Chat"] = "CHAT";
    EventTypes["Checkout"] = "CHECKOUT";
    EventTypes["Comment"] = "COMMENT";
    EventTypes["Confirm"] = "CONFIRM";
    EventTypes["ContactRequest"] = "CONTACT_REQUEST";
    EventTypes["Consumers"] = "CONSUMERS";
    EventTypes["Email"] = "EMAIL";
    EventTypes["Login"] = "LOGIN";
    EventTypes["Identity"] = "IDENTITY";
    EventTypes["Notification"] = "NOTIFICATION";
    EventTypes["OrderUpdate"] = "ORDER_UPDATE";
    EventTypes["Payment"] = "PAYMENT";
    EventTypes["Purchase"] = "PURCHASE";
    EventTypes["PnrRecord"] = "PNR_RECORD";
    EventTypes["Sms"] = "SMS";
    EventTypes["Subscription"] = "SUBSCRIPTION";
    EventTypes["Search"] = "SEARCH";
    EventTypes["Select"] = "SELECT";
    EventTypes["Trigger"] = "TRIGGER";
    EventTypes["TripSummary"] = "TRIP_SUMMARY";
    EventTypes["Update"] = "UPDATE";
    EventTypes["View"] = "VIEW";
})(EventTypes = exports.EventTypes || (exports.EventTypes = {}));


/***/ }),

/***/ 181:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deleteCookie = exports.filterCookiesByPrefix = exports.getDefaultCookieAttributes = exports.createCookieString = exports.cookieExists = exports.getCookie = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var consts_1 = __webpack_require__(968);
var interfaces_1 = __webpack_require__(936);
/**
 * Retrieves the cookie, if it exists in the cookie string
 * @param cookieStr - The cookie string containing every cookie
 * @param cookieName - The cookie name to be found
 * @returns - an object that contains the cookie name and value or undefined, if not found
 */
function getCookie(cookieStr, cookieName) {
    if (!cookieStr)
        return undefined;
    var found = cookieStr.split('; ').find(function (cookie) {
        return cookie.indexOf('=') > 0 && cookie.split('=')[0] === cookieName;
    });
    return found !== undefined ? { name: found.split('=')[0], value: found.split('=')[1] } : undefined;
}
exports.getCookie = getCookie;
/**
 * Checks if the cookie exists in the cookie string
 * @param cookieStr - The cookie string containing every cookie
 * @param cookieName - The cookie name to be found
 * @returns - boolean value, if the cookie is found in the cookie string
 */
function cookieExists(cookieStr, cookieName) {
    return cookieStr.split('; ').some(function (cookie) { return cookie.split('=')[0] === cookieName; });
}
exports.cookieExists = cookieExists;
/**
 * Creates the cookie string with the respectively cookie attributes
 * @param name - name of the cookie
 * @param value - value of the cookie
 * @param attributes - an object of supported cookie attributes
 * @returns - a string that will be passed to document.cookie
 */
function createCookieString(name, value, attributes) {
    var cookieString = "".concat(name, "=").concat(value, ";");
    cookieString += " Max-Age=".concat(attributes.maxAge, "; SameSite=").concat(attributes.sameSite, ";");
    cookieString += attributes.secure ? ' Secure;' : '';
    cookieString += attributes.path ? " Path=".concat(attributes.path, ";") : '';
    cookieString += attributes.domain ? " Domain=".concat(attributes.domain, ";") : '';
    cookieString = cookieString.substring(0, cookieString.length - 1);
    return cookieString;
}
exports.createCookieString = createCookieString;
/**
 * Gets the default Cookie Attributes
 * @param  maxAge - Set the cookie "Max-Age" attribute in days.
 * @returns the default configuration settings for the cookie string
 */
// eslint-disable-next-line max-len
function getDefaultCookieAttributes(maxAge, cookieDomain) {
    if (maxAge === void 0) {
        maxAge = consts_1.DEFAULT_COOKIE_EXPIRY_DAYS;
    }
    return {
        domain: cookieDomain,
        maxAge: maxAge * consts_1.DAILY_SECONDS,
        path: '/',
        sameSite: interfaces_1.SameSiteProperties.None,
        secure: true,
    };
}
exports.getDefaultCookieAttributes = getDefaultCookieAttributes;
/**
 * Filters cookies starting with the given prefix
 * @param cookieStr - The cookie string containing every cookie
 * @param prefix - The prefix that will be used to filter the results
 * @returns - an array with cookie objects (name, value)
 */
function filterCookiesByPrefix(cookieStr, prefix) {
    return cookieStr
        .split('; ')
        .filter(function (cookie) { return cookie.split('=')[0].startsWith(prefix); })
        .map(function (cookie) {
        return {
            name: cookie.split('=')[0],
            value: cookie.split('=')[1],
        };
    });
}
exports.filterCookiesByPrefix = filterCookiesByPrefix;
/**
 * Deletes a cookie from the document (client-side only)
 * @param cookieName - The cookie to be deleted
 */
function deleteCookie(cookieName) {
    document.cookie = cookieName + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}
exports.deleteCookie = deleteCookie;


/***/ }),

/***/ 795:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
/* eslint-disable multiline-comment-style */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isISODateString = exports.isShortISODateString = void 0;
/**
 * Checks if the provided string is a shortened version of ISO 8601 date format ‘YYYY-MM-DD’T’hh:mm’
 * @param date - The date string provided by the developer
 * @returns - A boolean if the string is valid otherwise false
 */
function isShortISODateString(date) {
    try {
        var dateString = date + 'Z';
        var convertedDate = new Date(dateString).toISOString().substring(0, 16);
        return convertedDate === date;
    }
    catch (_) {
        return false;
    }
}
exports.isShortISODateString = isShortISODateString;
/**
 * Evaluates if the provided string is the long version of ISO 8601 date format ‘YYYY-MM-DD’T’hh:mm:ss.sssZ’
 * @param date - The date string provided by the developer
 * @returns - A boolean if the strign is valid, otherwise false
 */
function isISODateString(date) {
    try {
        var convertedDate = new Date(date).toISOString();
        return convertedDate === date;
    }
    catch (_) {
        return false;
    }
}
exports.isISODateString = isISODateString;


/***/ }),

/***/ 11:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isValidEmail = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
/**
 *
 * @param email - the email string to be validated
 * @returns - a boolean value depending on whether the email value passed is valid
 */
function isValidEmail(email) {
    var regx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regx.test(email);
}
exports.isValidEmail = isValidEmail;


/***/ }),

/***/ 295:
/***/ (function(__unused_webpack_module, exports) {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fetchWithTimeout = void 0;
/**
 * Fetches data from the specified URL within the given timeout period.
 *
 * @param url - The URL to fetch data from.
 * @param timeout - The time in milliseconds to wait before timing out the request.
 * @param fetchOptions - The options to pass to the fetch API.
 * @returns - A Promise that resolves to the fetched data, or null if the request was aborted or timed out.
 * @throws  - If the timeout value is invalid.
 */
function fetchWithTimeout(url, timeout, fetchOptions) {
    return __awaiter(this, void 0, Promise, function () {
        var abortController, signal, timeoutHandler;
        return __generator(this, function (_a) {
            if (!Number.isInteger(timeout) || timeout < 0)
                throw new Error('[IV-0006] Incorrect value for the timeout parameter. Set the value to an integer greater than or equal to 0.');
            abortController = new AbortController();
            signal = abortController.signal;
            timeoutHandler = setTimeout(function () {
                abortController.abort();
            }, timeout);
            return [2 /*return*/, fetch(url, __assign(__assign({}, fetchOptions), { signal: signal }))
                    .then(function (response) {
                    clearTimeout(timeoutHandler);
                    return response.json();
                })
                    .then(function (data) { return data; })
                    .catch(function (error) {
                    if (error.name === 'AbortError')
                        throw new Error('[IE-0003] Timeout exceeded. The server did not respond within the allotted time.');
                    return null;
                })];
        });
    });
}
exports.fetchWithTimeout = fetchWithTimeout;


/***/ }),

/***/ 614:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.flattenObject = void 0;
/**
 * A function that flattens an object, by combining the keys with an "_".
 * @param data - An object that has the required data to perform the flattening
 * @returns - A new flattened object
 * @example
 *
 * ```ts
 * const object = {order:{amount: 1, delivered: false}}
 * const flattenedObject = flattenObject(object)
 * // flattenedObject will be {order_amount: 1, order_delivered: false}
 * ```
 */
function flattenObject(data) {
    var _a;
    var currentKey = data.currentKey, object = data.object;
    var newObject = (_a = data.newObject) !== null && _a !== void 0 ? _a : {};
    for (var key in object) {
        var value = object[key];
        if (value === undefined)
            continue;
        if (typeof value === 'object' && !Array.isArray(value))
            flattenObject({
                currentKey: "".concat(currentKey ? "".concat(currentKey, "_").concat(key) : key),
                newObject: newObject,
                object: value,
            });
        else
            newObject[currentKey ? "".concat(currentKey, "_").concat(key) : key] = value;
    }
    return newObject;
}
exports.flattenObject = flattenObject;


/***/ }),

/***/ 920:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBrowserIdFromCdp = void 0;
var consts_1 = __webpack_require__(968);
var fetch_with_timeout_1 = __webpack_require__(295);
var url_builder_1 = __webpack_require__(206);
/**
 * Gets the browser ID from Sitecore CDP
 * @param targetURL - From global settings
 * @param clientKey - From global settings
 * @returns the browser ID
 */
function getBrowserIdFromCdp(targetURL, clientKey, timeout) {
    return __awaiter(this, void 0, Promise, function () {
        var fetchOptions, response, ref;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fetchOptions = {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        headers: { 'X-Library-Version': consts_1.LIBRARY_VERSION },
                    };
                    if (!(timeout !== undefined))
                        return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, fetch_with_timeout_1.fetchWithTimeout)((0, url_builder_1.generateCreateBrowserIdUrl)(targetURL, clientKey), timeout, fetchOptions)];
                case 1:
                    response = _a.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, fetch((0, url_builder_1.generateCreateBrowserIdUrl)(targetURL, clientKey), fetchOptions)
                        .then(function (res) { return res.json(); })
                        .then(function (data) { return data; })
                        .catch(function () { return undefined; })];
                case 3:
                    response = _a.sent();
                    _a.label = 4;
                case 4:
                    if (!response)
                        return [2 /*return*/, ''];
                    ref = response.ref;
                    return [2 /*return*/, ref];
            }
        });
    });
}
exports.getBrowserIdFromCdp = getBrowserIdFromCdp;


/***/ }),

/***/ 996:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1)
            throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (_)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
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
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getGuestId = void 0;
var consts_1 = __webpack_require__(968);
/**
 * A function that gets the guest ref from CDP.
 * @param browserId - The browser id of the client
 * @param targetURL - The target url from the settings
 * @param clientKey - The client key
 * @returns - A promise that resolves with the guest ref
 * @throws - Will throw an error if the clientKey/browser id is invalid
 */
function getGuestId(browserId, targetURL, clientKey) {
    return __awaiter(this, void 0, Promise, function () {
        var url, response, data, _a, errorMsg, moreInfo;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    url = "".concat(targetURL, "/").concat(consts_1.API_VERSION, "/browser/").concat(browserId, "/show.json?client_key=").concat(clientKey, "&api_token=").concat(clientKey);
                    return [4 /*yield*/, fetch(url, { headers: { 'X-Library-Version': consts_1.LIBRARY_VERSION } })];
                case 1:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _b.sent();
                    if (!response.ok) {
                        _a = data, errorMsg = _a.error_msg, moreInfo = _a.moreInfo;
                        throw new Error("".concat(errorMsg, ", for more info: ").concat(moreInfo));
                    }
                    return [2 /*return*/, data.customer.ref];
            }
        });
    });
}
exports.getGuestId = getGuestId;


/***/ }),

/***/ 352:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getPointOfSale = void 0;
/**
 * Validates the pointOfSale parameter. Throws an error if parameter is empty
 * @param pointOfSale - The pointOfSale passed from the init settings.
 * @returns - The retrieved pointOfSale attribute to be sent to the API
 */
function getPointOfSale(pointOfSale) {
    if (pointOfSale && pointOfSale.trim().length > 0)
        return pointOfSale;
    throw Error('[MV-0003] "pointOfSale" is required.');
}
exports.getPointOfSale = getPointOfSale;


/***/ }),

/***/ 936:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SameSiteProperties = void 0;
/**
 * Values for the [sameSite] cookie property
 */
var SameSiteProperties;
(function (SameSiteProperties) {
    SameSiteProperties["Strict"] = "Strict";
    SameSiteProperties["Lax"] = "Lax";
    SameSiteProperties["None"] = "None";
})(SameSiteProperties = exports.SameSiteProperties || (exports.SameSiteProperties = {}));


/***/ }),

/***/ 206:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.generateCallFlowUrl = exports.generateCreateBrowserIdUrl = void 0;
// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
var consts_1 = __webpack_require__(968);
/**
 * Creates the URL for retrieving the browser ID from Sitecore CDP
 * @param targetURL - From global settings
 * @param clientKey - From global settings
 * @returns The URL string for retrieving the browser ID
 */
function generateCreateBrowserIdUrl(targetURL, clientKey) {
    // eslint-disable-next-line max-len
    return "".concat(targetURL, "/").concat(consts_1.API_VERSION, "/").concat(consts_1.EndPoint.Browser, "/create.json?client_key=").concat(clientKey, "&message={}");
}
exports.generateCreateBrowserIdUrl = generateCreateBrowserIdUrl;
/**
 * Creates the URL for sending callFlows to Sitecore CDP with the Version
 * @param targetURL - From global settings
 * @returns The URL string for sending events
 */
function generateCallFlowUrl(targetURL) {
    return "".concat(targetURL, "/").concat(consts_1.CALLFLOW_API_VERSION, "/").concat(consts_1.EndPoint.CallFlows);
}
exports.generateCallFlowUrl = generateCallFlowUrl;


/***/ }),

/***/ 895:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var map = {
	"./web-personalization.ts": 355
};


function webpackContext(req) {
	var id = webpackContextResolve(req);
	return __webpack_require__(id);
}
function webpackContextResolve(req) {
	if(!__webpack_require__.o(map, req)) {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	}
	return map[req];
}
webpackContext.keys = function webpackContextKeys() {
	return Object.keys(map);
};
webpackContext.resolve = webpackContextResolve;
module.exports = webpackContext;
webpackContext.id = 895;

/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"name":"@sitecore/engage","version":"1.4.0","license":"Apache-2.0","module":"./esm/src/index.mjs","main":"./cjs/src/index.cjs","types":"./types/index.d.ts","exports":{".":{"types":"./types/index.d.ts","import":"./esm/src/index.mjs","require":"./cjs/src/index.cjs"}}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
var exports = __webpack_exports__;

// © Sitecore Corporation A/S. All rights reserved. Sitecore® is a registered trademark of Sitecore Corporation A/S.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.init = void 0;
var initializer_1 = __webpack_require__(993);
Object.defineProperty(exports, "init", ({ enumerable: true, get: function () { return initializer_1.init; } }));

})();

window.Engage = __webpack_exports__;
/******/ })()
;