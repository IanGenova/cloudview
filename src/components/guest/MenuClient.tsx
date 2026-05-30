'use client';

import {
  type ButtonHTMLAttributes,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Utensils,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { createGuestOrder } from '@/app/t/[tagCode]/actions';

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  categoryName: string;
};

type CartItem = {
  productId: string;
  quantity: number;
  notes?: string;
};

type OrderType = 'ROOM_SERVICE' | 'DINE_IN' | 'TAKE_OUT' | 'PICK_UP';

const orderTypeLabels: Record<OrderType, string> = {
  ROOM_SERVICE: 'Room Service / Deliver to Room',
  DINE_IN: 'Dine In',
  TAKE_OUT: 'Take Out',
  PICK_UP: 'Pick Up at Counter',
};

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

        if (Date.now() - lastPointerTap.current < 450) {
          return;
        }

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
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function ProductImage({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  if (!product.imageUrl) {
    return (
      <div
        className={cn(
          'grid place-items-center bg-neutral-900 text-white/40',
          className
        )}
      >
        <Utensils className="size-8" />
      </div>
    );
  }

  return (
    <div
      className={cn('bg-cover bg-center', className)}
      style={{
        backgroundImage: `url(${product.imageUrl})`,
      }}
      aria-label={product.name}
    />
  );
}

function buildOrderNotes({
  orderType,
  notes,
}: {
  orderType: OrderType;
  notes: string;
}) {
  const parts = [
    `Order Type: ${orderTypeLabels[orderType]}`,
    'Guest confirmed the selected order type before placing this order.',
  ];

  if (notes.trim()) {
    parts.push(`Guest Notes: ${notes.trim()}`);
  }

  return parts.join('\n');
}

export function MenuClient({
  tagCode,
  products,
  currency,
  taxRate = 0,
  serviceChargeRate = 0,
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
  const [orderType, setOrderType] = useState<OrderType>('ROOM_SERVICE');
  const [confirmedClause, setConfirmedClause] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    'ROOM_CHARGE' | 'PAY_AT_COUNTER' | 'CASH' | 'POS'
  >('ROOM_CHARGE');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.categoryName)))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return (activeCategory === 'All'
      ? products
      : products.filter((p) => p.categoryName === activeCategory)
    ).filter((p) => {
      if (!query) {
        return true;
      }

      return `${p.name} ${p.description ?? ''} ${p.categoryName}`
        .toLowerCase()
        .includes(query);
    });
  }, [activeCategory, products, searchQuery]);

  const featured = filteredProducts[0] ?? products[0];

  const subtotal = cart.reduce(
    (sum, item) =>
      sum + (productMap.get(item.productId)?.priceCents ?? 0) * item.quantity,
    0
  );

  const serviceCharge = Math.round(subtotal * serviceChargeRate);
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + serviceCharge + tax;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function add(productId: string) {
    setError(null);

    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);

      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [...current, { productId, quantity: 1 }];
    });
  }

  function updateQty(productId: string, quantity: number) {
    setError(null);

    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function submit() {
    setError(null);

    if (!cart.length) {
      setError('Please add at least one item before placing your order.');
      return;
    }

    if (!confirmedClause) {
      setError('Please confirm the order type before placing your order.');
      return;
    }

    startTransition(async () => {
      try {
        const finalNotes = buildOrderNotes({
          orderType,
          notes,
        });

        const result = await createGuestOrder({
          tagCode,
          guestName,
          notes: finalNotes,
          paymentMethod,
          items: cart,
        });

        if (result.ok) {
          router.push(`/t/${tagCode}/confirmed/${result.orderCode}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to submit order.');
      }
    });
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#f8f3ec] px-5 pb-28 pt-2 text-ink">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="grid size-10 place-items-center rounded-full hover:bg-black/5"
            aria-label="Back to menu"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div className="text-center">
            <h2 className="font-black">Your Cart</h2>
            <p className="text-xs text-neutral-500">
              Review items before placing your order
            </p>
          </div>

          <div />
        </div>

        <div className="rounded-[2rem] bg-white p-4 shadow-soft">
          {cart.length === 0 ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-neutral-100">
                  <ShoppingBag className="size-6" />
                </div>
                <h3 className="mt-4 text-xl font-black">Your cart is empty</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Add food or drinks from the menu.
                </p>
                <Button
                  type="button"
                  onClick={() => setScreen('menu')}
                  className="mt-5"
                >
                  Back to Menu
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                const product = productMap.get(item.productId)!;

                return (
                  <div
                    key={item.productId}
                    className="grid grid-cols-[72px_1fr_32px] gap-3 border-b border-neutral-100 pb-4 last:border-b-0"
                  >
                    <ProductImage
                      product={product}
                      className="size-[72px] rounded-2xl bg-neutral-100"
                    />

                    <div>
                      <h3 className="font-black leading-tight">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-neutral-700">
                        {simpleMoney(product.priceCents, currency)}
                      </p>

                      <div className="mt-3 inline-flex items-center gap-3 rounded-full bg-neutral-50 px-2 py-1">
                        <TapButton
                          onTap={() =>
                            updateQty(item.productId, item.quantity - 1)
                          }
                          className="grid size-8 place-items-center rounded-full hover:bg-white"
                          aria-label={`Decrease ${product.name}`}
                        >
                          <Minus className="size-3" />
                        </TapButton>

                        <span className="min-w-4 text-center text-sm font-black">
                          {item.quantity}
                        </span>

                        <TapButton
                          onTap={() =>
                            updateQty(item.productId, item.quantity + 1)
                          }
                          className="grid size-8 place-items-center rounded-full hover:bg-white"
                          aria-label={`Increase ${product.name}`}
                        >
                          <Plus className="size-3" />
                        </TapButton>
                      </div>
                    </div>

                    <TapButton
                      onTap={() => updateQty(item.productId, 0)}
                      className="grid size-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
                      aria-label={`Remove ${product.name}`}
                    >
                      <X className="size-4" />
                    </TapButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 ? (
          <>
            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <h3 className="mb-3 font-black">Order Details</h3>

              <div className="space-y-3">
                <Input
                  placeholder="Guest name optional"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Order Type
                  </label>
                  <Select
                    value={orderType}
                    onChange={(e) => {
                      setOrderType(e.target.value as OrderType);
                      setConfirmedClause(false);
                    }}
                  >
                    <option value="ROOM_SERVICE">
                      Room Service / Deliver to Room
                    </option>
                    <option value="DINE_IN">Dine In</option>
                    <option value="TAKE_OUT">Take Out</option>
                    <option value="PICK_UP">Pick Up at Counter</option>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Payment Method
                  </label>
                  <Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                  >
                    <option value="ROOM_CHARGE">Room charge</option>
                    <option value="PAY_AT_COUNTER">Pay at counter</option>
                    <option value="CASH">Cash</option>
                    <option value="POS">Card / E-wallet</option>
                  </Select>
                </div>

                <Textarea
                  placeholder="Special instructions / notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />

                <label className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  <input
                    type="checkbox"
                    checked={confirmedClause}
                    onChange={(event) =>
                      setConfirmedClause(event.target.checked)
                    }
                    className="mt-1 size-4"
                  />

                  <span>
                    I confirm this order is for{' '}
                    <b>{orderTypeLabels[orderType]}</b>. I understand that
                    preparation time and claiming/delivery process may depend on
                    the selected order type.
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <b>{money(subtotal, currency)}</b>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    Service charge ({Math.round(serviceChargeRate * 100)}%)
                  </span>
                  <b>{money(serviceCharge, currency)}</b>
                </div>

                {taxRate > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">
                      Tax ({Math.round(taxRate * 100)}%)
                    </span>
                    <b>{money(tax, currency)}</b>
                  </div>
                ) : null}

                <div className="border-t border-neutral-100 pt-4 text-base">
                  <div className="flex justify-between">
                    <span className="font-black">Total</span>
                    <span className="font-black">{money(total, currency)}</span>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                  {error}
                </p>
              ) : null}

              <Button
                type="button"
                onClick={submit}
                disabled={pending || !confirmedClause}
                size="lg"
                className="mt-5 w-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Submitting...' : 'Place Order'}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-black px-5 pb-28 pt-2 text-white">
      <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
        <button
          type="button"
          onClick={() => router.push(`/t/${tagCode}`)}
          className="grid size-10 place-items-center rounded-full hover:bg-white/10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="text-center">
          <h2 className="font-black">Order Food</h2>
          <p className="text-xs text-white/50">
            Tap items to add them to your cart
          </p>
        </div>

        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="relative grid size-10 place-items-center rounded-full hover:bg-white/10"
          aria-label="Open cart"
        >
          <ShoppingBag className="size-5" />
          {itemCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-ink">
              {itemCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="mb-4 flex h-12 items-center gap-3 rounded-2xl bg-white/10 px-4">
        <Search className="size-5 text-white/40" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search menu..."
          className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/40"
        />
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => {
          const active = category === activeCategory;

          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={cn(
                'shrink-0 rounded-full px-5 py-3 text-sm font-black',
                active ? 'bg-sand text-ink' : 'bg-white/5 text-white'
              )}
            >
              {category}
            </button>
          );
        })}
      </div>

      {featured ? (
        <section className="mb-6">
          <h3 className="mb-3 font-serif font-black">Chef’s Recommendations</h3>

          <button
            type="button"
            onClick={() => add(featured.id)}
            className="w-full overflow-hidden rounded-[1.75rem] bg-white text-left text-ink"
          >
            <ProductImage
              product={featured}
              className="h-44 w-full bg-neutral-900"
            />

            <div className="grid grid-cols-[1fr_64px] items-center gap-3 p-4">
              <div>
                <h4 className="text-lg font-black">{featured.name}</h4>
                <p className="mt-2 text-base font-black">
                  {simpleMoney(featured.priceCents, currency)}
                </p>
              </div>

              <span className="grid size-14 place-items-center rounded-full bg-black text-white">
                <Plus className="size-7" />
              </span>
            </div>
          </button>
        </section>
      ) : null}

      <div className="space-y-3">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => add(product.id)}
            className="grid w-full grid-cols-[84px_1fr_48px] items-center gap-3 rounded-[1.5rem] bg-white/5 p-3 text-left"
          >
            <ProductImage
              product={product}
              className="size-[84px] rounded-2xl bg-neutral-900"
            />

            <div className="min-w-0">
              <h4 className="truncate font-black">{product.name}</h4>
              {product.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                  {product.description}
                </p>
              ) : (
                <p className="mt-1 text-xs text-white/35">No description</p>
              )}
              <p className="mt-1 text-sm font-black text-sand">
                {simpleMoney(product.priceCents, currency)}
              </p>
            </div>

            <span className="grid size-11 place-items-center rounded-full bg-white text-black">
              <Plus className="size-5" />
            </span>
          </button>
        ))}

        {!filteredProducts.length ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
            <Utensils className="mx-auto size-8 text-white/40" />
            <h3 className="mt-3 font-black">No menu items found</h3>
            <p className="mt-1 text-sm text-white/45">
              Try another category or search term.
            </p>
          </div>
        ) : null}
      </div>

      {itemCount > 0 ? (
        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-gold px-5 py-4 font-black text-ink shadow-xl"
        >
          <span>View Cart ({itemCount})</span>
          <span>{money(total, currency)}</span>
        </button>
      ) : null}
    </div>
  );
}