import { type ReactNode } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ModalOpenButton } from '@/components/dashboard/ModalOpenButton';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';
import { DashboardSuccess } from '@/components/dashboard/DashboardSuccess';
import { ConfirmSubmitButton } from '@/components/dashboard/ConfirmSubmitButton';
import {
  createCategoryAction,
  createProductAction,
  deleteCategoryAction,
  deleteProductAction,
  updateCategoryAction,
  updateProductAction
} from './actions';

function FormField({
  label,
  helper,
  children,
  className = ''
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
  size = 'max-w-3xl'
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

      <div className="max-h-[78vh] overflow-y-auto p-5">
        {children}
      </div>
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
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'
};

function getProductImage(product: {
  name: string;
  category: { name: string };
  images: { url: string }[];
}) {
  if (product.images[0]?.url) return product.images[0].url;

  const text = `${product.name} ${product.category.name}`.toLowerCase();

  if (text.includes('pancake') || text.includes('breakfast')) return fallbackFoodImages.breakfast;
  if (text.includes('sandwich') || text.includes('club')) return fallbackFoodImages.sandwich;
  if (text.includes('burger')) return fallbackFoodImages.burger;
  if (text.includes('tea') || text.includes('drink')) return fallbackFoodImages.tea;

  return fallbackFoodImages.default;
}

export default async function MenuManagementPage({
  searchParams
}: {
  searchParams?: Promise<{ success?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const hotelWhere = user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! };
  const itemWhere = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [hotels, categories, products] = await Promise.all([
    db.hotel.findMany({
      where: hotelWhere,
      orderBy: { name: 'asc' }
    }),

    db.menuCategory.findMany({
      where: itemWhere,
      include: {
        hotel: true,
        _count: {
          select: {
            products: true
          }
        }
      },
      orderBy: [
        { hotel: { name: 'asc' } },
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    }),

    db.menuProduct.findMany({
      where: itemWhere,
      include: {
        hotel: true,
        category: true,
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1
        },
        recipes: {
          include: {
            inventoryItem: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return (
    <div>
      <PageHeader
        title="Menu Management"
        description="Digital menu categories, products, images, pricing, availability, and recipe links."
      />
        <DashboardSuccess
            success={params?.success}
            messages={{
              'category-created': 'Category successfully added.',
              'category-updated': 'Category successfully updated.',
              'category-deleted': 'Category successfully deleted.',
              'product-created': 'Product successfully added.',
              'product-updated': 'Product successfully updated.',
              'product-deleted': 'Product successfully deleted.'
            }}
          />

      <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black">Products</h2>
          <p className="mt-1 text-sm text-neutral-500">
            These items appear in the Guest Portal and POS Terminal.
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

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {products.map((product) => {
          const imageUrl = getProductImage(product);
          const editModalId = `edit-product-${product.id}`;

          return (
            <article
              key={product.id}
              className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft"
            >
              <div
                className="h-44 bg-neutral-100 bg-cover bg-center"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />

              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black">{product.name}</h3>
                      <StatusBadge status={product.isAvailable ? 'Available' : 'Hidden'} />
                    </div>

                    <p className="mt-1 text-sm font-semibold text-neutral-500">
                      {product.hotel.name} · {product.category.name} · {product.prepTimeMinutes} min
                    </p>
                  </div>

                  <p className="shrink-0 text-xl font-black">{money(product.priceCents)}</p>
                </div>

                <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">
                  {product.description || 'No description provided.'}
                </p>

                {product.recipes.length > 0 ? (
                  <div className="mt-4 rounded-2xl bg-gold/10 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
                      Recipe / Stock Deduction
                    </p>

                    <p className="mt-2 text-sm font-bold text-neutral-700">
                      {product.recipes
                        .map(
                          (recipe) =>
                            `${Number(recipe.quantity)} ${recipe.inventoryItem.unit} ${recipe.inventoryItem.name}`
                        )
                        .join(', ')}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl bg-neutral-50 p-3 text-xs font-semibold text-neutral-500">
                    No recipe linked yet.
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <ModalOpenButton
                    modalId={editModalId}
                    className="gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </ModalOpenButton>

                  <form action={deleteProductAction}>
                    <input type="hidden" name="productId" value={product.id} />
                                  <ConfirmSubmitButton
                  label="Delete"
                  message="Are you sure you want to delete this product?"
                  className="bg-red-600 text-white hover:bg-red-700"
                />
                  </form>
                </div>
              </div>

              <Modal
                id={editModalId}
                title={`Edit ${product.name}`}
                description="Update product details, pricing, image, and availability."
              >
                <form
                  action={updateProductAction}
                  encType="multipart/form-data"
                  className="grid gap-5 md:grid-cols-2"
                >
                  <input type="hidden" name="productId" value={product.id} />

                  <FormField label="Menu Category">
                    <Select name="categoryId" required defaultValue={product.categoryId}>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.hotel.name} · {category.name}
                          {!category.isActive ? ' (Hidden)' : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Product Name">
                    <Input name="name" defaultValue={product.name} required />
                  </FormField>

                  <FormField label="Price">
                    <Input
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(product.priceCents / 100).toString()}
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

                  <FormField
                    label="Upload New Product Image"
                    helper="Leave blank to keep the current image."
                    className="md:col-span-2"
                  >
                    <Input
                      name="imageFile"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                    />
                  </FormField>

                  <FormField
                    label="Image URL"
                    helper="Optional. If filled, this replaces the current image."
                    className="md:col-span-2"
                  >
                    <Input
                      name="imageUrl"
                      type="url"
                      placeholder="https://..."
                    />
                  </FormField>

                  <FormField label="Description" className="md:col-span-2">
                    <Textarea
                      name="description"
                      defaultValue={product.description || ''}
                    />
                  </FormField>

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
                    <Button className="w-full">Save Product Changes</Button>
                  </div>
                </form>
              </Modal>
            </article>
          );
        })}
      </div>

      <Modal
        id="product-modal"
        title="Add Product"
        description="Create a new menu item with image, price, description, and availability."
      >
        <form
          action={createProductAction}
          encType="multipart/form-data"
          className="grid gap-5 md:grid-cols-2"
        >
          <FormField label="Menu Category" helper="Select where this product will appear.">
            <Select name="categoryId" required>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.hotel.name} · {category.name}
                  {!category.isActive ? ' (Hidden)' : ''}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Product Name">
            <Input name="name" placeholder="Club Sandwich" required />
          </FormField>

          <FormField label="Price" helper="Example: 280 means ₱280.00.">
            <Input name="price" type="number" min="0" step="0.01" placeholder="280" required />
          </FormField>

          <FormField label="Preparation Time">
            <Input name="prepTimeMinutes" type="number" min="0" defaultValue="15" />
          </FormField>

          <FormField label="Upload Product Image" className="md:col-span-2">
            <Input
              name="imageFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
            />
          </FormField>

          <FormField label="Image URL" className="md:col-span-2">
            <Input name="imageUrl" type="url" placeholder="https://..." />
          </FormField>

          <FormField label="Description" className="md:col-span-2">
            <Textarea name="description" placeholder="Short product description." />
          </FormField>

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
        </form>
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
          Add menu groups like Breakfast, Mains, Dinner, Drinks, Desserts, or Poolside Menu.
        </p>
      </CardHeader>

      <CardContent>
        <form action={createCategoryAction} className="space-y-5">
          {user.role === 'SUPER_ADMIN' ? (
            <FormField label="Hotel / Property" helper="Choose which hotel this category belongs to.">
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

          <FormField label="Category Name" helper="Example: Breakfast, Mains, Dinner, Drinks.">
            <Input name="name" placeholder="Breakfast" required />
          </FormField>

          <FormField label="Sort Order" helper="Lower numbers appear first. Use 0 if unsure.">
            <Input name="sortOrder" type="number" min="0" defaultValue="0" />
          </FormField>

          <Button className="w-full">Create Category</Button>
        </form>
      </CardContent>
    </Card>

    <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 bg-neutral-50 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-black">Existing Categories</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Edit category name, sort order, availability, or delete unused categories.
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
            <h4 className="text-lg font-black text-neutral-700">No categories yet</h4>
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

                    <form id={updateFormId} action={updateCategoryAction} className="contents">
                      <input type="hidden" name="categoryId" value={category.id} />

                      <div>
                        <Input name="name" defaultValue={category.name} required />
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
                    </form>

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

                      <form action={deleteCategoryAction}>
                        <input type="hidden" name="categoryId" value={category.id} />
                          <ConfirmSubmitButton
                          label="Delete"
                          message="Are you sure you want to delete this category?"
                          className="bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
                        />
                      </form>
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