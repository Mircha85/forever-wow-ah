/**
 * Which game the app is talking to.
 *
 * This used to be decided in four places, and the four places disagreed:
 * the ingestion pipeline wrote retail-prefixed keys from a Forever
 * namespace, the connected-realm lookup hardcoded the retail namespace
 * whatever the product was, and the extraction script pulled retail data
 * even when `BLIZZARD_PRODUCT` said forever. The result was a bucket
 * whose prefix and contents could describe different games.
 *
 * One variable now decides both: the auction namespace that is queried
 * and the R2 prefix that the result is stored under.
 */

export type Product = 'retail' | 'forever';

/**
 * The product the app is configured for.
 *
 * `BLIZZARD_PRODUCT=forever` selects WoW: Forever; anything else (or
 * nothing) means WoW Retail. Retail is the default because it is the game
 * whose API is live today — Forever's auction namespace only starts
 * answering on its launch day, and pointing the pipeline at a namespace
 * that 404s would fail every run.
 */
export function resolveProduct(
  env: Record<string, string | undefined> = process.env
): Product {
  return env.BLIZZARD_PRODUCT === 'forever' ? 'forever' : 'retail';
}

/**
 * The auction namespace for a product and region.
 *
 * WoW: Forever is the Anniversary line, served from `dynamic-classicann-
 * {region}`. Retail is served from `dynamic-{region}`.
 *
 * These are not interchangeable: a request against the wrong namespace
 * succeeds against the wrong game rather than failing, which is the worse
 * outcome — it produces plausible data from a game the user did not ask
 * about.
 */
export function auctionNamespace(product: Product, region: string): string {
  return product === 'forever'
    ? `dynamic-classicann-${region}`
    : `dynamic-${region}`;
}

/**
 * The static item catalog namespace. The same for both games — the static
 * catalog is not partitioned by product.
 */
export function itemNamespace(region: string): string {
  return `static-${region}`;
}
