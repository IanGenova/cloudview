import { type ReactNode } from 'react';
import { MenuProductType, type Prisma } from '@prisma/client';
import { Plus, Pencil, X, CheckCircle2, Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { MenuImageUploadPreview } from '@/components/dashboard/MenuImageUploadPreview';
import { ModalOpenButton } from '@/components/dashboard/ModalOpenButton';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';
import {
  MenuActionForm,
  MenuConfirmDeleteButton,
  MenuPageToast,
  MenuToastListener,
} from './MenuClientActions';
import {
  createCategoryAction,
  createProductAction,
  deleteCategoryAction,
  deleteProductAction,
  updateCategoryAction,
  updateProductAction,
} from './actions';

import {
  DynamicBundleComponentFields,
  ProductBundleProvider,
  ProductTypeField,
} from './DynamicBundleFields';


type BundleComponentOption = {
  id: string;
  hotelId: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  productType: MenuProductType;
  hotel: {
    name: string;
  };
  category: {
    name: string;
  };
};

type BundleComponentValue = {
  componentProductId: string;
  quantity: number;
};

type Message =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

function getMenuMessage(success?: string, error?: string): Message {
  if (success) {
    const messages: Record<string, string> = {
      'category-created': 'Menu category was created successfully.',
      'category-updated': 'Menu category was updated successfully.',
      'category-deleted': 'Menu category was deleted successfully.',
      'product-created': 'Menu item was created successfully.',
      'product-updated': 'Menu item was updated successfully.',
      'product-deleted': 'Menu item was deleted successfully.',
    };

    return {
      type: 'success',
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'category-required': 'Menu category is required.',
      'category-not-found': 'Menu category was not found.',
      'product-required': 'Menu item is required.',
      'product-not-found': 'Menu item was not found.',
      'bundle-components-required':
        'Bundle menu items must have at least one component item.',
      'bundle-self-component':
        'A bundle cannot include itself as a component.',
      'nested-bundle-not-supported':
        'Nested bundles are not supported. Use single menu items as bundle components.',
      'invalid-image-type':
        'Invalid image type. Please upload JPG, PNG, WEBP, or GIF.',
      'image-too-large': 'Image is too large. Maximum upload size is 5MB.',
    };

    return {
      type: 'error',
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

function Toast({ message }: { message: Message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          message.type === 'success'
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl'
        }
      >
        <div
          className={
            message.type === 'success'
              ? 'grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white'
              : 'grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white'
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <X className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {message.type === 'success' ? 'Success' : 'Action failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
        </div>

        <a
          href="/dashboard/menu"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </a>
      </div>
    </div>
  );
}

function FormField({
  label,
  helper,
  children,
  className = '',
}: {
  label: string;
  helper?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-sm font-black text-neutral-800">{label}</span>
      {children}
      {helper ? (
        <span className="text-xs font-medium leading-relaxed text-neutral-500">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

function Modal({
  id,
  title,
  description,
  children,
  size = 'max-w-3xl',
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  size?: string;
}) {
  return (
    <dialog
      id={id}
      className={`w-[calc(100%-1.5rem)] ${size} rounded-[2rem] border border-neutral-200 bg-white p-0 shadow-2xl backdrop:bg-black/50`}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-100 bg-white p-5">
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          ) : null}
        </div>

        <form method="dialog">
          <button
            className="grid size-10 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </form>
      </div>

      <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

const fallbackFoodImages = {
  breakfast:
    'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=900&q=80',
  sandwich:
    'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80',
  burger:
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
  tea:
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80',
  default:
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
};

function getProductImage(product: {
  name: string;
  category: { name: string };
  images: { url: string }[];
}) {
  if (product.images[0]?.url) return product.images[0].url;

  const text = `${product.name} ${product.category.name}`.toLowerCase();

  if (text.includes('pancake') || text.includes('breakfast')) {
    return fallbackFoodImages.breakfast;
  }

  if (text.includes('sandwich') || text.includes('club')) {
    return fallbackFoodImages.sandwich;
  }

  if (text.includes('burger')) {
    return fallbackFoodImages.burger;
  }

  if (text.includes('tea') || text.includes('drink')) {
    return fallbackFoodImages.tea;
  }

  return fallbackFoodImages.default;
}

function productTypeLabel(productType: MenuProductType) {
  return productType === MenuProductType.BUNDLE
    ? 'Bundle / Combo'
    : 'Single Item';
}

function getBundleNormalTotalCents(
  components: Array<{
    quantity: number;
    componentProduct: {
      priceCents: number;
    };
  }>
) {
  return components.reduce(
    (sum, component) =>
      sum + component.quantity * component.componentProduct.priceCents,
    0
  );
}

function parseProductType(value?: string) {
  if (value === MenuProductType.SINGLE) {
    return MenuProductType.SINGLE;
  }

  if (value === MenuProductType.BUNDLE) {
    return MenuProductType.BUNDLE;
  }

  return '';
}

function parseAvailability(value?: string) {
  if (value === 'available' || value === 'hidden') {
    return value;
  }

  return '';
}

export default async function MenuManagementPage({
    searchParams,
}: {
 searchParams?: Promise<{
  success?: string;
  error?: string;
  q?: string;
  hotelId?: string;
  categoryId?: string;
  productType?: string;
  availability?: string;
}>;

}) {
  const params = await searchParams;
  const message = getMenuMessage(params?.success, params?.error);
  const user = await requireUser();

 const searchTerm = (params?.q ?? '').trim();
const selectedHotelId =
  user.role === 'SUPER_ADMIN' ? (params?.hotelId ?? '').trim() : user.hotelId!;
const selectedCategoryId = (params?.categoryId ?? '').trim();
const selectedProductType = parseProductType(params?.productType);
const selectedAvailability = parseAvailability(params?.availability);

const hotelWhere = user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! };

const itemWhere: Prisma.MenuCategoryWhereInput =
  user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

const productWhere: Prisma.MenuProductWhereInput = {
  ...(user.role === 'SUPER_ADMIN'
    ? selectedHotelId
      ? { hotelId: selectedHotelId }
      : {}
    : { hotelId: user.hotelId! }),

  ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),

  ...(selectedProductType ? { productType: selectedProductType } : {}),

  ...(selectedAvailability === 'available' ? { isAvailable: true } : {}),
  ...(selectedAvailability === 'hidden' ? { isAvailable: false } : {}),

  ...(searchTerm
    ? {
        OR: [
          {
            name: {
              contains: searchTerm,
            },
          },
          {
            description: {
              contains: searchTerm,
            },
          },
          {
            category: {
              name: {
                contains: searchTerm,
              },
            },
          },
          {
            hotel: {
              name: {
                contains: searchTerm,
              },
            },
          },
        ],
      }
    : {}),
};

  const [hotels, categories, products, bundleProducts] = await Promise.all([
  db.hotel.findMany({
    where: hotelWhere,
    orderBy: { name: 'asc' },
  }),

  db.menuCategory.findMany({
    where: itemWhere,
    include: {
      hotel: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: [
      { hotel: { name: 'asc' } },
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  }),

  db.menuProduct.findMany({
    where: productWhere,
    include: {
      hotel: true,
      category: true,
      images: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
      },
      recipes: {
        include: {
          inventoryItem: true,
        },
      },
      bundleComponents: {
        include: {
          componentProduct: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  }),

  db.menuProduct.findMany({
    where: {
      ...(user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! }),
      productType: MenuProductType.SINGLE,
    },
    select: {
      id: true,
      hotelId: true,
      name: true,
      priceCents: true,
      isAvailable: true,
      productType: true,
      hotel: {
        select: {
          name: true,
        },
      },
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      {
        hotel: {
          name: 'asc',
        },
      },
      {
        name: 'asc',
      },
    ],
  }),
]);

  const bundleComponentOptions = bundleProducts.map((product) => ({
  id: product.id,
  hotelId: product.hotelId,
  name: product.name,
  priceCents: product.priceCents,
  isAvailable: product.isAvailable,
  productType: product.productType,
  hotel: {
    name: product.hotel.name,
  },
  category: {
    name: product.category.name,
  },
}));

const filterCategories = selectedHotelId
  ? categories.filter((category) => category.hotelId === selectedHotelId)
  : categories;

const hasActiveFilters = Boolean(
  searchTerm ||
    (user.role === 'SUPER_ADMIN' && selectedHotelId) ||
    selectedCategoryId ||
    selectedProductType ||
    selectedAvailability
);

  return (
    <div>
      <MenuPageToast initialMessage={message} />
      <MenuToastListener />
      <PageHeader
        title="Menu Management"
        description="Digital menu categories, products, images, pricing, availability, bundle menus, and recipe links."
      />

      <div className="mb-4 flex flex-col gap-3 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft md:flex-row md:items-center md:justify-between">
  <div>
    <h2 className="text-xl font-black">Products</h2>
    <p className="mt-1 text-sm text-neutral-500">
      These items appear in the Guest Portal and POS Terminal. Products
      can now be single items or fixed bundles.
    </p>
  </div>

  <div className="flex flex-col gap-2 sm:flex-row">
    <ModalOpenButton
      modalId="category-modal"
      className="gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100"
    >
      <Plus className="size-4" />
      Add / Manage Categories
    </ModalOpenButton>

    <ModalOpenButton
      modalId="product-modal"
      className="gap-2 bg-black text-white hover:bg-neutral-800"
    >
      <Plus className="size-4" />
      Add Product
    </ModalOpenButton>
  </div>
</div>

<form
  action="/dashboard/menu"
  method="get"
  className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft"
>
  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-2xl bg-gold/15 text-gold">
          <SlidersHorizontal className="size-4" />
        </span>

        <h3 className="text-lg font-black">Filter Menu Products</h3>
      </div>

      <p className="mt-1 text-sm font-semibold text-neutral-500">
        Showing {products.length} product{products.length === 1 ? '' : 's'}
        {hasActiveFilters ? ' matching your filters.' : '.'}
      </p>
    </div>

    {hasActiveFilters ? (
      <a
        href="/dashboard/menu"
        className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-black hover:bg-neutral-100"
      >
        Clear Filters
      </a>
    ) : null}
  </div>

  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    <label className="grid gap-2 xl:col-span-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
        Search
      </span>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />

        <Input
          name="q"
          defaultValue={searchTerm}
          placeholder="Search product, category, or hotel..."
          className="pl-11"
        />
      </div>
    </label>

    {user.role === 'SUPER_ADMIN' ? (
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
          Hotel
        </span>

        <Select name="hotelId" defaultValue={selectedHotelId}>
          <option value="">All hotels</option>
          {hotels.map((hotel) => (
            <option key={hotel.id} value={hotel.id}>
              {hotel.name}
            </option>
          ))}
        </Select>
      </label>
    ) : null}

    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
        Category
      </span>

      <Select name="categoryId" defaultValue={selectedCategoryId}>
        <option value="">All categories</option>
        {filterCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.hotel.name} · {category.name}
            {!category.isActive ? ' (Hidden)' : ''}
          </option>
        ))}
      </Select>
    </label>

    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
        Type
      </span>

      <Select name="productType" defaultValue={selectedProductType}>
        <option value="">All types</option>
        <option value={MenuProductType.SINGLE}>Single Item</option>
        <option value={MenuProductType.BUNDLE}>Bundle / Combo</option>
      </Select>
    </label>

    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
        Availability
      </span>

      <Select name="availability" defaultValue={selectedAvailability}>
        <option value="">All availability</option>
        <option value="available">Available only</option>
        <option value="hidden">Hidden only</option>
      </Select>
    </label>
  </div>

  <div className="mt-4 flex justify-end">
    <Button type="submit" className="min-w-36 gap-2">
      <Search className="size-4" />
      Apply Filters
    </Button>
  </div>
</form>


     {products.length === 0 ? (
  <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-10 text-center shadow-soft">
    <h3 className="text-xl font-black text-neutral-800">
      No products found
    </h3>

    <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-neutral-500">
      Try changing the search keyword, category, product type, hotel, or
      availability filter.
    </p>

    {hasActiveFilters ? (
      <a
        href="/dashboard/menu"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-black px-5 py-2 text-sm font-black text-white hover:bg-neutral-800"
      >
        Clear Filters
      </a>
    ) : null}
  </div>
) : (

<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
  {products.map((product) => {
    const imageUrl = getProductImage(product);
    const editModalId = `edit-product-${product.id}`;
    const isBundle = product.productType === MenuProductType.BUNDLE;
    const bundleNormalTotalCents = getBundleNormalTotalCents(
      product.bundleComponents
    );
    const bundleSavingsCents =
      isBundle && bundleNormalTotalCents > product.priceCents
        ? bundleNormalTotalCents - product.priceCents
        : 0;
return (
  <div key={product.id} className="contents">
    <article className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-soft">

        <div
          className="h-32 bg-neutral-100 bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-black">
                  {product.name}
                </h3>

                <StatusBadge
                  status={product.isAvailable ? 'Available' : 'Hidden'}
                />

                <span
                  className={
                    isBundle
                      ? 'rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800'
                      : 'rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-black text-neutral-600'
                  }
                >
                  {productTypeLabel(product.productType)}
                </span>
              </div>

              <p className="mt-1 text-xs font-semibold text-neutral-500">
                {product.hotel.name} · {product.category.name} ·{' '}
                {product.prepTimeMinutes} min
              </p>
            </div>

            <p className="shrink-0 text-lg font-black">
              {money(product.priceCents)}
            </p>
          </div>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-600">
            {product.description || 'No description provided.'}
          </p>

          {isBundle ? (
            <div className="mt-3 rounded-xl bg-amber-50 p-2.5">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                Bundle / Combo Includes
              </p>

              {product.bundleComponents.length > 0 ? (
                <>
                  <div className="mt-2 space-y-1">
                    {product.bundleComponents.map((component) => (
                      <p
                        key={component.id}
                        className="text-xs font-bold text-neutral-700"
                      >
                        {component.quantity}× {component.componentProduct.name}
                      </p>
                    ))}
                  </div>

                  {bundleNormalTotalCents > 0 ? (
                    <div className="mt-2 rounded-xl bg-white/80 p-2 text-[11px] font-black text-amber-900">
                      <p>Normal total: {money(bundleNormalTotalCents)}</p>
                      {bundleSavingsCents > 0 ? (
                        <p className="mt-1">
                          Guest saves: {money(bundleSavingsCents)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-xs font-bold text-amber-800">
                  No bundle components yet.
                </p>
              )}
            </div>
         ) : null}

         
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ModalOpenButton
              modalId={editModalId}
              className="gap-2 border border-neutral-200 bg-white px-3 py-2 text-sm text-black hover:bg-neutral-100"
            >
              <Pencil className="size-4" />
              Edit
            </ModalOpenButton>

           <MenuConfirmDeleteButton
              id={product.id}
              fieldName="productId"
              itemName={product.name}
              itemType="product"
              action={deleteProductAction}
              successMessage="Menu item was deleted successfully."
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
         </article>

      <Modal
        id={editModalId}
        title={`Edit ${product.name}`}
        description="Update product details, image, price, availability, and menu category."
      >
        <MenuActionForm
          action={updateProductAction}
          successMessage="Menu item was updated successfully."
          className="grid gap-5 md:grid-cols-2"
        >
          <ProductBundleProvider defaultProductType={product.productType}>
            <input type="hidden" name="productId" value={product.id} />

            <FormField
              label="Menu Category"
              helper="Select where this product will appear."
            >
              <Select name="categoryId" defaultValue={product.categoryId} required>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.hotel.name} · {category.name}
                    {!category.isActive ? ' (Hidden)' : ''}
                  </option>
                ))}
              </Select>
            </FormField>

            <ProductTypeField helper="Choose Single Item or Bundle / Combo." />

            <FormField label="Product Name">
              <Input name="name" defaultValue={product.name} required />
            </FormField>

            <FormField label="Price" helper="Example: 280 means ₱280.00.">
              <Input
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(product.priceCents / 100).toFixed(2)}
                required
              />
            </FormField>

            <FormField label="Preparation Time">
              <Input
                name="prepTimeMinutes"
                type="number"
                min="0"
                defaultValue={product.prepTimeMinutes}
              />
            </FormField>

            <FormField label="Upload Product Image" className="md:col-span-2">
              <MenuImageUploadPreview name="imageFile" />
            </FormField>

            <FormField label="Image URL" className="md:col-span-2">
              <Input
                name="imageUrl"
                type="url"
                defaultValue={product.images[0]?.url ?? ''}
                placeholder="https://..."
              />
            </FormField>

            <FormField label="Description" className="md:col-span-2">
              <Textarea
                name="description"
                defaultValue={product.description ?? ''}
                placeholder="Short product description."
              />
            </FormField>

            <DynamicBundleComponentFields componentOptions={bundleComponentOptions} />

            <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 md:col-span-2">
              <input
                name="isAvailable"
                type="checkbox"
                defaultChecked={product.isAvailable}
                className="size-4 accent-black"
              />
              <span>
                <span className="block text-sm font-black">Available</span>
                <span className="text-xs font-medium text-neutral-500">
                  Show this product in the guest portal and POS.
                </span>
              </span>
            </label>

            <div className="md:col-span-2">
              <Button className="w-full">Save Product</Button>
            </div>
          </ProductBundleProvider>
        </MenuActionForm>
      </Modal>
    </div>
  );
})}
</div>

)}
      <Modal
        id="product-modal"
        title="Add Product"
        description="Create a single menu item or a fixed bundle/combo."
      >
      <MenuActionForm
  action={createProductAction}
  successMessage="Menu item was created successfully."
  className="grid gap-5 md:grid-cols-2"
>
            <ProductBundleProvider defaultProductType="SINGLE">
              <FormField
                label="Menu Category"
                helper="Select where this product will appear."
              >
                <Select name="categoryId" required>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.hotel.name} · {category.name}
                      {!category.isActive ? ' (Hidden)' : ''}
                    </option>
                  ))}
                </Select>
              </FormField>

              <ProductTypeField helper="Choose Single Item or Bundle / Combo." />

              <FormField label="Product Name">
                <Input name="name" placeholder="Club Sandwich" required />
              </FormField>

              <FormField label="Price" helper="Example: 280 means ₱280.00.">
                <Input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="280"
                  required
                />
              </FormField>

              <FormField label="Preparation Time">
                <Input
                  name="prepTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue="15"
                />
              </FormField>

              <FormField label="Upload Product Image" className="md:col-span-2">
                <MenuImageUploadPreview name="imageFile" />
              </FormField>

              <FormField label="Image URL" className="md:col-span-2">
                <Input name="imageUrl" type="url" placeholder="https://..." />
              </FormField>

              <FormField label="Description" className="md:col-span-2">
                <Textarea
                  name="description"
                  placeholder="Short product description."
                />
              </FormField>

              <DynamicBundleComponentFields componentOptions={bundleComponentOptions} />

              <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 md:col-span-2">
                <input
                  name="isAvailable"
                  type="checkbox"
                  defaultChecked
                  className="size-4 accent-black"
                />
                <span>
                  <span className="block text-sm font-black">Available</span>
                  <span className="text-xs font-medium text-neutral-500">
                    Show this product in the guest portal and POS.
                  </span>
                </span>
              </label>

              <div className="md:col-span-2">
                <Button className="w-full">Create Product</Button>
              </div>
            </ProductBundleProvider>
          </MenuActionForm>
      </Modal>

      <Modal
        id="category-modal"
        title="Add / Manage Categories"
        description="Create, update, hide/show, or delete menu categories."
        size="max-w-6xl"
      >
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Add category</CardTitle>
              <p className="mt-2 text-sm text-neutral-500">
                Add menu groups like Breakfast, Mains, Dinner, Drinks,
                Desserts, or Poolside Menu.
              </p>
            </CardHeader>

            <CardContent>
             <MenuActionForm
              action={createCategoryAction}
              successMessage="Menu category was created successfully."
              className="space-y-5"
              closeDialog={false}
            >
                {user.role === 'SUPER_ADMIN' ? (
                  <FormField
                    label="Hotel / Property"
                    helper="Choose which hotel this category belongs to."
                  >
                    <Select name="hotelId" required>
                      {hotels.map((hotel) => (
                        <option key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ) : (
                  <input type="hidden" name="hotelId" value={user.hotelId!} />
                )}

                <FormField
                  label="Category Name"
                  helper="Example: Breakfast, Mains, Dinner, Drinks."
                >
                  <Input name="name" placeholder="Breakfast" required />
                </FormField>

                <FormField
                  label="Sort Order"
                  helper="Lower numbers appear first. Use 0 if unsure."
                >
                  <Input
                    name="sortOrder"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                </FormField>

                <Button className="w-full">Create Category</Button>
             </MenuActionForm>
            </CardContent>
          </Card>

          <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 bg-neutral-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-black">Existing Categories</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Edit category name, sort order, availability, or delete
                    unused categories.
                  </p>
                </div>

                <span className="rounded-full bg-black px-4 py-2 text-sm font-black text-white">
                  {categories.length} categories
                </span>
              </div>
            </div>

            {categories.length === 0 ? (
              <div className="p-6">
                <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
                  <h4 className="text-lg font-black text-neutral-700">
                    No categories yet
                  </h4>
                  <p className="mt-2 text-sm text-neutral-500">
                    Create your first category using the form on the left.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-[1.2fr_1.3fr_110px_130px_110px_180px] gap-3 border-b border-neutral-100 bg-neutral-50 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                    <div>Hotel</div>
                    <div>Category</div>
                    <div>Sort</div>
                    <div>Available</div>
                    <div>Products</div>
                    <div className="text-right">Actions</div>
                  </div>

                  <div className="divide-y divide-neutral-100">
                    {categories.map((category) => {
                      const updateFormId = `update-category-${category.id}`;

                      return (
                        <div
                          key={category.id}
                          className="grid grid-cols-[1.2fr_1.3fr_110px_130px_110px_180px] items-center gap-3 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-black text-neutral-700">
                              {category.hotel.name}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-neutral-400">
                              Property
                            </p>
                          </div>

                          <MenuActionForm
                            id={updateFormId}
                            action={updateCategoryAction}
                            successMessage="Menu category was updated successfully."
                            className="contents"
                            closeDialog={false}
                          >
                            <input
                              type="hidden"
                              name="categoryId"
                              value={category.id}
                            />

                            <div>
                              <Input
                                name="name"
                                defaultValue={category.name}
                                required
                              />
                            </div>

                            <div>
                              <Input
                                name="sortOrder"
                                type="number"
                                min="0"
                                defaultValue={category.sortOrder}
                              />
                            </div>

                            <div>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2 text-sm font-black">
                                <input
                                  name="isActive"
                                  type="checkbox"
                                  defaultChecked={category.isActive}
                                  className="size-4 accent-black"
                                />
                                Active
                              </label>
                            </div>
                          </MenuActionForm>

                          <div>
                            <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-black">
                              {category._count.products}
                            </span>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="submit"
                              form={updateFormId}
                              className="rounded-xl bg-black px-4 py-2 text-xs font-black text-white hover:bg-neutral-800"
                            >
                              Save
                            </button>

                            <MenuConfirmDeleteButton
                              id={category.id}
                              fieldName="categoryId"
                              itemName={category.name}
                              itemType="category"
                              action={deleteCategoryAction}
                              successMessage="Menu category was deleted successfully."
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </Modal>
    </div>
  );
}