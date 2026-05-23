'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2
} from 'lucide-react';
import { createPOSOrder } from './actions';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';

type POSHotel = {
  id: string;
  name: string;
};

type POSRoom = {
  id: string;
  number: string;
  name: string | null;
};

type POSProduct = {
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
};

export function POSClient({
  hotels,
  selectedHotelId,
  rooms,
  products,
  currency
}: {
  hotels: POSHotel[];
  selectedHotelId: string;
  rooms: POSRoom[];
  products: POSProduct[];
  currency: string;
}) {
  const router = useRouter();

  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [guestName, setGuestName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'CASH' | 'POS' | 'ROOM_CHARGE' | 'PAY_AT_COUNTER'
  >('CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [lastOrderCode, setLastOrderCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();

  const productMap = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(products.map((product) => product.categoryName)))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.categoryName === category;
      const matchesSearch =
        !lowerQuery ||
        `${product.name} ${product.description || ''} ${product.categoryName}`
          .toLowerCase()
          .includes(lowerQuery);

      return matchesCategory && matchesSearch;
    });
  }, [category, products, query]);

  const subtotal = cart.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    return sum + (product?.priceCents || 0) * item.quantity;
  }, 0);

  const total = subtotal;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cashValue = Number(cashTendered || 0) * 100;
  const change = paymentMethod === 'CASH' ? Math.max(0, cashValue - total) : 0;

  function addItem(productId: string) {
    setLastOrderCode(null);

    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);

      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { productId, quantity: 1 }];
    });
  }

  function updateQty(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId ? { ...item, quantity } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function clearCart() {
    setCart([]);
    setGuestName('');
    setRoomId('');
    setNotes('');
    setCashTendered('');
    setError(null);
  }

  function completeSale() {
    setError(null);

    if (cart.length === 0) {
      setError('Please add at least one item.');
      return;
    }

    if (paymentMethod === 'CASH' && cashValue < total) {
      setError('Cash tendered is lower than the total amount.');
      return;
    }

    startTransition(async () => {
      try {
        const response = await createPOSOrder({
          hotelId: selectedHotelId,
          roomId: roomId || null,
          guestName,
          notes,
          paymentMethod,
          items: cart
        });

        if (response.ok) {
          setLastOrderCode(response.orderCode);
          clearCart();
          setMobileView('products');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to complete POS sale.');
      }
    });
  }

  return (
    <div className="relative pb-24 lg:pb-0">
      <div className="mb-4 grid grid-cols-2 gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView('products')}
          className={cn(
            'min-h-12 rounded-2xl border px-4 py-3 text-sm font-black',
            mobileView === 'products'
              ? 'border-black bg-black text-white'
              : 'border-neutral-200 bg-white text-black'
          )}
        >
          Products
        </button>

        <button
          type="button"
          onClick={() => setMobileView('cart')}
          className={cn(
            'relative min-h-12 rounded-2xl border px-4 py-3 text-sm font-black',
            mobileView === 'cart'
              ? 'border-black bg-black text-white'
              : 'border-neutral-200 bg-white text-black'
          )}
        >
          Cart

          {itemCount > 0 ? (
            <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs text-black">
              {itemCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <section
          className={cn(
            'min-w-0',
            mobileView === 'cart' ? 'hidden lg:block' : 'block'
          )}
        >
          <div className="mb-5 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft">
            <div className="grid gap-3 md:grid-cols-[240px_1fr]">
              <select
                value={selectedHotelId}
                onChange={(event) => {
                  router.push(`/dashboard/pos?hotelId=${event.target.value}`);
                }}
                className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>

              <div className="flex h-12 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
                <Search className="size-4 shrink-0 text-neutral-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search menu product..."
                  className="w-full bg-transparent text-sm font-semibold outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => {
                const active = category === item;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={cn(
                      'shrink-0 touch-manipulation rounded-full border px-4 py-2 text-sm font-black transition active:scale-95',
                      active
                        ? 'border-black bg-black text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addItem(product.id)}
                className="touch-manipulation overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
              >
                <div
                  className="h-28 bg-neutral-100 bg-cover bg-center sm:h-36"
                  style={{
                    backgroundImage: product.imageUrl ? `url(${product.imageUrl})` : undefined
                  }}
                />

                <div className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black sm:text-lg">
                        {product.name}
                      </h3>

                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
                        {product.description || 'No description'}
                      </p>
                    </div>

                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black text-white">
                      <Plus className="size-5" />
                    </span>
                  </div>

                  <p className="mt-3 text-base font-black text-gold sm:text-lg">
                    {money(product.priceCents, currency)}
                  </p>
                </div>
              </button>
            ))}

            {filteredProducts.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-10 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                <p className="font-black text-neutral-600">No products found</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Try another keyword or category.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <aside
          className={cn(
            'lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]',
            mobileView === 'products' ? 'hidden lg:block' : 'block'
          )}
        >
          <section className="flex min-h-[75vh] flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft lg:h-full">
            <div className="border-b border-neutral-100 bg-black p-5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileView('products')}
                    className="grid size-10 place-items-center rounded-full bg-white/10 lg:hidden"
                    aria-label="Back to products"
                  >
                    <ArrowLeft className="size-5" />
                  </button>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-gold">
                      Cloud View POS
                    </p>
                    <h2 className="mt-1 text-2xl font-black">Current Sale</h2>
                  </div>
                </div>

                <div className="relative">
                  <ShoppingCart className="size-7 text-gold" />

                  {itemCount > 0 ? (
                    <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-black">
                      {itemCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {lastOrderCode ? (
                <div className="mb-4 rounded-[1.5rem] border border-green-200 bg-green-50 p-4 text-green-800">
                  <p className="font-black">Sale completed</p>
                  <p className="mt-1 text-sm font-semibold">
                    Order {lastOrderCode} was sent to the kitchen.
                  </p>
                </div>
              ) : null}

              {cart.length === 0 ? (
                <div className="grid min-h-52 place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
                  <div>
                    <ReceiptText className="mx-auto size-9 text-neutral-400" />
                    <p className="mt-3 font-black text-neutral-600">Cart is empty</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Tap products to add them to the POS cart.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {cart.map((item) => {
                  const product = productMap.get(item.productId);

                  if (!product) return null;

                  return (
                    <div
                      key={item.productId}
                      className="rounded-[1.25rem] border border-neutral-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-black">{product.name}</h3>
                          <p className="mt-1 text-sm font-bold text-neutral-500">
                            {money(product.priceCents, currency)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => updateQty(item.productId, 0)}
                          className="grid size-10 touch-manipulation place-items-center rounded-full bg-red-50 text-red-600 active:scale-95"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-full bg-neutral-50 p-1">
                          <button
                            type="button"
                            onClick={() => updateQty(item.productId, item.quantity - 1)}
                            className="grid size-10 touch-manipulation place-items-center rounded-full bg-white active:scale-95"
                          >
                            <Minus className="size-4" />
                          </button>

                          <span className="min-w-10 text-center text-sm font-black">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() => updateQty(item.productId, item.quantity + 1)}
                            className="grid size-10 touch-manipulation place-items-center rounded-full bg-white active:scale-95"
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>

                        <p className="font-black">
                          {money(product.priceCents * item.quantity, currency)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 space-y-3">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Customer / guest name"
                  className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-semibold outline-none"
                />

                <select
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold outline-none"
                >
                  <option value="">No room / walk-in customer</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.number} {room.name ? `- ${room.name}` : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as typeof paymentMethod)
                  }
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="POS">Card / E-wallet</option>
                  <option value="ROOM_CHARGE">Room Charge</option>
                  <option value="PAY_AT_COUNTER">Pay Later</option>
                </select>

                {paymentMethod === 'CASH' ? (
                  <input
                    value={cashTendered}
                    onChange={(event) => setCashTendered(event.target.value)}
                    placeholder="Cash tendered"
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-semibold outline-none"
                  />
                ) : null}

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Order notes"
                  className="min-h-24 w-full resize-none rounded-2xl border border-neutral-200 p-4 text-sm font-semibold outline-none"
                />
              </div>
            </div>

            <div className="border-t border-neutral-100 bg-neutral-50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-bold text-neutral-500">Subtotal</span>
                  <span className="font-black">{money(subtotal, currency)}</span>
                </div>

                <div className="flex justify-between text-lg">
                  <span className="font-black">Total</span>
                  <span className="font-black">{money(total, currency)}</span>
                </div>

                {paymentMethod === 'CASH' ? (
                  <div className="flex justify-between">
                    <span className="font-bold text-neutral-500">Change</span>
                    <span className="font-black">{money(change, currency)}</span>
                  </div>
                ) : null}
              </div>

              {error ? (
                <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={clearCart}
                  className="min-h-12 touch-manipulation rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-black hover:bg-neutral-100 active:scale-[0.98]"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={completeSale}
                  disabled={pending || cart.length === 0}
                  className="min-h-12 touch-manipulation rounded-2xl bg-black px-4 py-3 text-sm font-black text-white hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? 'Processing...' : 'Complete Sale'}
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {mobileView === 'products' && itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView('cart')}
            className="flex min-h-14 w-full touch-manipulation items-center justify-between rounded-2xl bg-black px-5 py-4 text-sm font-black text-white active:scale-[0.98]"
          >
            <span>View Cart ({itemCount})</span>
            <span>{money(total, currency)}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}