import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { Country, CountryCities } from '@/types/domain'

/** Every country, fetched once: the list does not change while the app is open. */
export function useCountries() {
  return useQuery({
    queryKey: qk.meta.countries(),
    queryFn: async () => (await api.get<Country[]>(endpoints.metaCountries)).data,
    staleTime: Infinity,
  })
}

/** The places in one country (15,000 people or more), by ISO code; idle until a country is chosen. */
export function useCities(countryCode: string) {
  return useQuery({
    queryKey: qk.meta.cities(countryCode),
    queryFn: async () =>
      (await api.get<CountryCities>(endpoints.metaCities(countryCode))).data.cities,
    staleTime: Infinity,
    enabled: countryCode !== '',
  })
}
