"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendFactory = void 0;
const Configuration_1 = require("../config/Configuration");
const OllamaBackend_1 = require("./OllamaBackend");
const OpenAICompatibleBackend_1 = require("./OpenAICompatibleBackend");
class BackendFactory {
    static getBackend() {
        const type = Configuration_1.Configuration.backend;
        if (type === 'openai-compatible') {
            return new OpenAICompatibleBackend_1.OpenAICompatibleBackend();
        }
        return new OllamaBackend_1.OllamaBackend();
    }
}
exports.BackendFactory = BackendFactory;
//# sourceMappingURL=BackendFactory.js.map