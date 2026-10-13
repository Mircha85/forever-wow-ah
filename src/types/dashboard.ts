export type ViewMode = 'catalog' | 'favorites' | 'professions' | 'flipping';

export type SortBy = 'price_desc' | 'price_asc' | 'qty_desc' | 'delta_desc' | 'delta_asc';

export interface RealmRef {
  id: number;
  name: string;
}

export interface FlippingOpportunity {
  itemId: number;
  name: string;
  icon: string;
  quality: number;
  type: 'intra_realm' | 'cross_realm';
  buyRealm: RealmRef;
  sellRealm: RealmRef;
  buyPrice: number;
  sellPrice: number;
  ahFee: number;
  netProfit: number;
  roi: number;
  volume: number;
}
