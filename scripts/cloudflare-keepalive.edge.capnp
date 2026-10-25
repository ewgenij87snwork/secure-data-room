using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "test", worker = (
      modules = [
        (name = "main", esModule = embed "cloudflare-keepalive.edge.mjs"),
        (name = "cloudflare-keepalive.mjs", esModule = embed "cloudflare-keepalive.mjs")
      ],
      compatibilityDate = "2026-10-05",
      globalOutbound = "origin"
    )),
    (name = "origin", worker = (
      modules = [(name = "origin", esModule = embed "cloudflare-keepalive.edge-origin.mjs")],
      compatibilityDate = "2026-10-05"
    ))
  ]
);
