"use strict";
/**
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateServiceStub = void 0;
/* global window */
/* global AbortController */
const node_fetch_1 = require("node-fetch");
const abort_controller_1 = require("abort-controller");
const featureDetection_1 = require("./featureDetection");
const streamArrayParser_1 = require("./streamArrayParser");
const stream_1 = require("stream");
function generateServiceStub(rpcs, protocol, servicePath, servicePort, authClient, requestEncoder, responseDecoder) {
    const fetch = featureDetection_1.hasWindowFetch()
        ? window.fetch
        : node_fetch_1.default;
    const serviceStub = {};
    for (const [rpcName, rpc] of Object.entries(rpcs)) {
        serviceStub[rpcName] = (request, options, _metadata, callback) => {
            // We cannot use async-await in this function because we need to return the canceller object as soon as possible.
            // Using plain old promises instead.
            const cancelController = featureDetection_1.hasAbortController()
                ? new AbortController()
                : new abort_controller_1.AbortController();
            const cancelSignal = cancelController.signal;
            let cancelRequested = false;
            const fetchParameters = requestEncoder(rpc, protocol, servicePath, servicePort, request);
            const url = fetchParameters.url;
            const headers = fetchParameters.headers;
            for (const key of Object.keys(options)) {
                headers[key] = options[key][0];
            }
            const streamArrayParser = new streamArrayParser_1.StreamArrayParser(rpc);
            authClient
                .getRequestHeaders()
                .then(authHeader => {
                const fetchRequest = {
                    headers: {
                        ...authHeader,
                        ...headers,
                    },
                    body: fetchParameters.body,
                    method: fetchParameters.method,
                    signal: cancelSignal,
                };
                if (fetchParameters.method === 'get' ||
                    fetchParameters.method === 'delete') {
                    delete fetchRequest['body'];
                }
                return fetch(url, fetchRequest);
            })
                .then((response) => {
                if (response.ok && rpc.responseStream) {
                    stream_1.pipeline(response.body, streamArrayParser, (err) => {
                        if (err &&
                            (!cancelRequested ||
                                (err instanceof Error && err.name !== 'AbortError'))) {
                            if (callback) {
                                callback(err);
                            }
                            streamArrayParser.emit('error', err);
                        }
                    });
                    return;
                }
                else {
                    return Promise.all([
                        Promise.resolve(response.ok),
                        response.arrayBuffer(),
                    ])
                        .then(([ok, buffer]) => {
                        const response = responseDecoder(rpc, ok, buffer);
                        callback(null, response);
                    })
                        .catch((err) => {
                        if (!cancelRequested || err.name !== 'AbortError') {
                            callback(err);
                        }
                    });
                }
            });
            if (rpc.responseStream) {
                return streamArrayParser;
            }
            return {
                cancel: () => {
                    cancelRequested = true;
                    cancelController.abort();
                },
            };
        };
    }
    return serviceStub;
}
exports.generateServiceStub = generateServiceStub;
//# sourceMappingURL=fallbackServiceStub.js.map