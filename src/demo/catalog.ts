import burger from './burger.webp';

export interface DemoProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  category: string;
  available: boolean;
  options?: readonly { name: string; price: number }[];
}

export const catalog: readonly DemoProduct[] = [
  { id: 'burger', name: 'Burger da Casa', description: 'Pão brioche, burger grelhado, cheddar e molho da casa. Acompanha batatas fritas.', price: 3290, image: burger, category: 'Combos', available: true, options: [{ name: 'Cheddar extra', price: 400 }, { name: 'Molho extra', price: 200 }] },
  { id: 'fries', name: 'Batatas crocantes', description: 'Porção de batatas douradas com páprica e molho da casa.', price: 1490, category: 'Acompanhamentos', available: true },
  { id: 'lemonade', name: 'Limonada da casa', description: 'Limonada gelada com hortelã, 350 ml.', price: 990, category: 'Bebidas', available: true },
  { id: 'brownie', name: 'Brownie de chocolate', description: 'Brownie de chocolate meio amargo, com casquinha crocante.', price: 1290, category: 'Sobremesas', available: true },
];

export function priceWithOptions(product: DemoProduct, selected: string[]): number | undefined {
  const options = product.options?.filter(option => selected.includes(option.name)) ?? [];
  if (options.length !== selected.length) return undefined;
  return product.price + options.reduce((total, option) => total + option.price, 0);
}
