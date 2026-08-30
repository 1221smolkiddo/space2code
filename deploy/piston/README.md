# Space2Code Piston preparation

Piston runs untrusted programs and requires a Linux host with Docker, cgroup v2, and privileged-container support. The supplied Compose file follows the upstream container contract and binds port 2000 to loopback so it is not public by default.

Start the service:

```sh
docker compose -f deploy/piston/compose.yml up -d
```

The Compose default follows the upstream `latest` image for initial evaluation. Before production, set `PISTON_IMAGE` to the exact tested digest, for example `ghcr.io/engineer-man/piston@sha256:...`.

The base image starts without language packages. Clone the official [engineer-man/piston](https://github.com/engineer-man/piston) repository on the Piston host, install its CLI dependencies, and install the initial runtimes against this API:

```sh
cd cli
npm install
node index.js -u http://127.0.0.1:2000 ppman install python
node index.js -u http://127.0.0.1:2000 ppman install javascript
node index.js -u http://127.0.0.1:2000 ppman install java
node index.js -u http://127.0.0.1:2000 ppman install c
node index.js -u http://127.0.0.1:2000 ppman install c++
```

Verify `GET /api/v2/runtimes`, then configure the Space2Code backend's `PISTON_EXECUTE_URL` as `http://127.0.0.1:2000/api/v2/execute` when it runs on the host. If the backend is another container, attach both services to a private Docker network and use the Piston service name. Do not expose Piston directly to browsers.

Privileged mode gives the container extensive host access and is required by Piston's Isolate-based sandbox. Use a dedicated host, keep Docker and Piston patched, restrict inbound traffic, and benchmark CPU/memory/concurrency before release. A provider that does not support privileged containers cannot host this configuration; Koyeb remains only a candidate until that capability and workload performance are proven.
