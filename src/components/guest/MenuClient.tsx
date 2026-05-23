'use client';

import { type ButtonHTMLAttributes, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, Search, ShoppingBag, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { createGuestOrder } from '@/app/t/[tagCode]/actions';

type Product = { id: string; name: string; description: string | null; priceCents: number; imageUrl: string | null; categoryName: string };
type CartItem = { productId: string; quantity: number; notes?: string };

const fallbackImages = [
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80'
];


function TapButton({
  onTap,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { onTap: () => void }) {
  const lastPointerTap = useRef(0);

  return (
    <button
      {...props}
      type="button"
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        lastPointerTap.current = Date.now();
        onTap();
      }}
      onClick={(event) => {
        event.stopPropagation();

        // Mobile browsers may fire click after pointer/touch.
        // Ignore the duplicate click, but still allow keyboard Enter/Space.
        if (Date.now() - lastPointerTap.current < 450) return;
        onTap();
      }}
      className={cn(
        'relative z-20 pointer-events-auto touch-manipulation select-none active:scale-95',
        className
      )}
    >
      {children}
    </button>
  );
}

function simpleMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function MenuClient({
  tagCode,
  products,
  currency,
  taxRate = 0,
  serviceChargeRate = 0
}: {
  tagCode: string;
  products: Product[];
  currency: string;
  taxRate?: number;
  serviceChargeRate?: number;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<'menu' | 'cart'>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'ROOM_CHARGE' | 'PAY_AT_COUNTER' | 'CASH' | 'POS'>('ROOM_CHARGE');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.categoryName)))], [products]);
  const filteredProducts = (activeCategory === 'All' ? products : products.filter((p) => p.categoryName === activeCategory)).filter((p) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return `${p.name} ${p.description ?? ''} ${p.categoryName}`.toLowerCase().includes(query);
  });
  const featured = products[0];
  const subtotal = cart.reduce((sum, item) => sum + (productMap.get(item.productId)?.priceCents ?? 0) * item.quantity, 0);
  const serviceCharge = Math.round(subtotal * serviceChargeRate);
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + serviceCharge + tax;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function add(productId: string) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) return current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { productId, quantity: 1 }];
    });
  }

  function updateQty(productId: string, quantity: number) {
    setCart((current) => current.map((item) => item.productId === productId ? { ...item, quantity } : item).filter((item) => item.quantity > 0));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createGuestOrder({ tagCode, guestName, notes, paymentMethod, items: cart });
        if (result.ok) router.push(`/t/${tagCode}/confirmed/${result.orderCode}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to submit order.');
      }
    });
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#f8f3ec] px-5 pb-28 pt-2 text-ink">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <button type="button" onClick={() => setScreen('menu')} className="grid size-10 place-items-center rounded-full hover:bg-black/5" aria-label="Back to menu">
            <ArrowLeft className="size-5" />
          </button>
          <div className="text-center">
            <h2 className="font-black">Your Cart</h2>
            <p className="text-xs text-neutral-500">Review items before placing your order</p>
          </div>
          <div />
        </div>

        <div className="rounded-[2rem] bg-white p-4 shadow-soft">
          {cart.length === 0 ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-neutral-100"><ShoppingBag className="size-6" /></div>
                <h3 className="mt-4 text-xl font-black">Your cart is empty</h3>
                <p className="mt-1 text-sm text-neutral-500">Add food or drinks from the menu.</p>
                <Button type="button" onClick={() => setScreen('menu')} className="mt-5">Back to Menu</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                const product = productMap.get(item.productId)!;
                const image = product.imageUrl || fallbackImages[cart.indexOf(item) % fallbackImages.length];
                return (
                  <div key={item.productId} className="grid grid-cols-[72px_1fr_32px] gap-3 border-b border-neutral-100 pb-4 last:border-b-0">
                    <div className="size-[72px] rounded-2xl bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
                    <div>
                      <h3 className="font-black leading-tight">{product.name}</h3>
                      <p className="mt-1 text-sm font-bold text-neutral-700">{simpleMoney(product.priceCents, currency)}</p>
                      <div className="mt-3 inline-flex items-center gap-3 rounded-full bg-neutral-50 px-2 py-1">
                        <TapButton onTap={() => updateQty(item.productId, item.quantity - 1)} className="grid size-8 place-items-center rounded-full hover:bg-white" aria-label={`Decrease ${product.name}`}><Minus className="size-3" /></TapButton>
                        <span className="min-w-4 text-center text-sm font-black">{item.quantity}</span>
                        <TapButton onTap={() => updateQty(item.productId, item.quantity + 1)} className="grid size-8 place-items-center rounded-full hover:bg-white" aria-label={`Increase ${product.name}`}><Plus className="size-3" /></TapButton>
                      </div>
                    </div>
                    <TapButton onTap={() => updateQty(item.productId, 0)} className="grid size-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100" aria-label={`Remove ${product.name}`}><X className="size-4" /></TapButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 ? (
          <>
            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <h3 className="mb-3 font-black">Guest Details</h3>
              <div className="space-y-3">
                <Input placeholder="Guest name optional" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                  <option value="ROOM_CHARGE">Room charge</option>
                  <option value="PAY_AT_COUNTER">Pay at counter</option>
                  <option value="CASH">Cash</option>
                  <option value="POS">POS payment placeholder</option>
                </Select>
                <Textarea placeholder="Special instructions / notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><b>{money(subtotal, currency)}</b></div>
                <div className="flex justify-between"><span className="text-neutral-500">Service charge ({Math.round(serviceChargeRate * 100)}%)</span><b>{money(serviceCharge, currency)}</b></div>
                {taxRate > 0 ? <div className="flex justify-between"><span className="text-neutral-500">Tax ({Math.round(taxRate * 100)}%)</span><b>{money(tax, currency)}</b></div> : null}
                <div className="border-t border-neutral-100 pt-4 text-base">
                  <div className="flex justify-between"><span className="font-black">Total</span><span className="font-black">{money(total, currency)}</span></div>
                </div>
              </div>
              {error ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
              <Button type="button" size="lg" disabled={pending || cart.length === 0} onClick={submit} className="mt-5 w-full bg-sand text-ink hover:bg-gold">
                {pending ? 'Placing order...' : 'Place Order'}
              </Button>
              <p className="mt-3 text-center text-xs text-neutral-500">Your order will be delivered to your room or current NFC location.</p>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-black px-5 pb-28 pt-2 text-white">
      <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
        <button type="button" onClick={() => router.push(`/t/${tagCode}`)} className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Back home">
          <ArrowLeft className="size-5" />
        </button>
        <div className="text-center">
          <h2 className="font-black">Order Food</h2>
          <p className="text-xs text-white/50">Tap items to add them to your cart</p>
        </div>
        <TapButton onTap={() => setScreen('cart')} className="relative grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="View cart">
          <ShoppingBag className="size-5" />
          {itemCount > 0 ? <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-black">{itemCount}</span> : null}
        </TapButton>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-white/70">
        <Search className="size-4 shrink-0" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search menu..."
          className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/35 outline-none"
        />
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-4">
        {categories.map((category) => (
          <TapButton key={category} onTap={() => setActiveCategory(category)} className={activeCategory === category ? 'shrink-0 rounded-full bg-sand px-5 py-3 text-xs font-black text-ink' : 'shrink-0 rounded-full bg-white/5 px-5 py-3 text-xs font-bold text-white/70'}>
            {category}
          </TapButton>
        ))}
      </div>

      {featured && !searchQuery.trim() ? (
        <section className="mb-6">
          <h3 className="mb-3 text-sm font-black">Chef’s Recommendations</h3>
          <article className="overflow-hidden rounded-[1.75rem] bg-white text-ink shadow-soft">
            <div className="h-44 bg-neutral-200 bg-cover bg-center" style={{ backgroundImage: `url(${featured.imageUrl || fallbackImages[0]})` }} />
            <div className="grid grid-cols-[1fr_52px] gap-3 p-4">
              <div>
                <h4 className="font-black">{featured.name}</h4>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{featured.description}</p>
                <b className="mt-2 block">{simpleMoney(featured.priceCents, currency)}</b>
              </div>
              <TapButton onTap={() => add(featured.id)} className="grid size-14 place-items-center self-end rounded-full bg-black text-white" aria-label={`Add ${featured.name} to cart`}><Plus className="size-6" /></TapButton>
            </div>
          </article>
        </section>
      ) : null}

      <section className="space-y-3">
        {filteredProducts.map((product, index) => (
          <article key={product.id} className="grid grid-cols-[82px_1fr_44px] gap-3 rounded-[1.5rem] bg-white/5 p-3">
            <div className="size-[82px] rounded-2xl bg-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${product.imageUrl || fallbackImages[index % fallbackImages.length]})` }} />
            <div className="min-w-0">
              <h4 className="font-black leading-tight">{product.name}</h4>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{product.description}</p>
              <p className="mt-2 text-sm font-black text-sand">{simpleMoney(product.priceCents, currency)}</p>
            </div>
            <TapButton onTap={() => add(product.id)} className="grid size-12 place-items-center self-center rounded-full bg-white text-black shadow-sm" aria-label={`Add ${product.name} to cart`}><Plus className="size-5" /></TapButton>
          </article>
        ))}

        {filteredProducts.length === 0 ? (
          <div className="rounded-[1.5rem] bg-white/5 p-6 text-center">
            <p className="font-black">No menu items found</p>
            <p className="mt-1 text-sm text-white/50">Try another category or search term.</p>
          </div>
        ) : null}
      </section>

      {itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-md px-5">
          <TapButton onTap={() => setScreen('cart')} className="flex w-full items-center justify-between rounded-[1.5rem] bg-neutral-900 px-5 py-4 font-black text-white shadow-soft">
            <span>View Cart ({itemCount})</span>
            <span>{money(subtotal, currency)}</span>
          </TapButton>
        </div>
      ) : null}
    </div>
  );
}
