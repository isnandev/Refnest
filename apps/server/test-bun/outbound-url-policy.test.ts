import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  isPublicIpAddress,
  makeOutboundUrlPolicy,
  type HostnameResolver
} from "../src/security/outbound-url-policy"

const resolver = (
  records: Readonly<Record<string, ReadonlyArray<string>>>
): HostnameResolver => (hostname) =>
  Effect.succeed(records[hostname] ?? [])

describe("outbound URL policy", () => {
  it("rejects non-public IPv4, IPv6, and embedded IPv4 address ranges", () => {
    const blocked = [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "64:ff9b::a9fe:a9fe",
      "2002:7f00:1::"
    ]

    for (const address of blocked) {
      expect(isPublicIpAddress(address), address).toBe(false)
    }

    expect(isPublicIpAddress("93.184.216.34")).toBe(true)
    expect(isPublicIpAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(true)
  })

  it("validates every resolved address and never performs live DNS in tests", async () => {
    const lookedUp: Array<string> = []
    const fakeResolver: HostnameResolver = (hostname) => {
      lookedUp.push(hostname)
      return resolver({
        "public.test": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
        "mixed.test": ["93.184.216.34", "127.0.0.1"]
      })(hostname)
    }
    const policy = makeOutboundUrlPolicy(fakeResolver)

    await expect(
      Effect.runPromise(policy.validate(new URL("https://public.test/page")))
    ).resolves.toMatchObject({ hostname: "public.test" })
    expect(
      await Effect.runPromise(
        policy.validate(new URL("https://mixed.test/page")).pipe(Effect.either)
      )
    ).toMatchObject({
      _tag: "Left",
      left: { _tag: "OutboundUrlPolicyFailure" }
    })
    expect(
      await Effect.runPromise(
        policy.validate(new URL("http://127.0.0.1/private")).pipe(Effect.either)
      )
    ).toMatchObject({
      _tag: "Left",
      left: { _tag: "OutboundUrlPolicyFailure" }
    })

    expect(lookedUp).toStrictEqual(["public.test", "mixed.test"])
  })

  it("allows loopback only when an explicit local-provider mode requests it", async () => {
    const policy = makeOutboundUrlPolicy(resolver({}))
    const local = new URL("http://127.0.0.1:11434/v1")

    expect(
      await Effect.runPromise(policy.validate(local).pipe(Effect.either))
    ).toMatchObject({
      _tag: "Left",
      left: { _tag: "OutboundUrlPolicyFailure" }
    })
    await expect(
      Effect.runPromise(policy.validate(local, { requireLoopback: true }))
    ).resolves.toMatchObject({ hostname: "127.0.0.1" })

    const misleadingLocalhost = makeOutboundUrlPolicy(
      resolver({ localhost: ["8.8.8.8"] })
    )
    expect(
      await Effect.runPromise(
        misleadingLocalhost
          .validate(new URL("http://localhost:11434"), {
            requireLoopback: true
          })
          .pipe(Effect.either)
      )
    ).toMatchObject({
      _tag: "Left",
      left: { _tag: "OutboundUrlPolicyFailure" }
    })
  })
})
