import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Package,
  PencilLine,
  PlusCircle,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { API_ENDPOINTS } from '../config/api'

type LengthOption = 'short' | 'standard' | 'detailed'

interface Product {
  id: string
  name: string
  category?: string | null
  brand?: string | null
  tagline?: string | null
  features: string[]
  seo_keywords: string[]
  tone?: string | null
  audience?: string | null
  language?: string | null
  length?: LengthOption | null
  additional_notes?: string | null
  description: string
  created_at: string
  updated_at: string
}

interface ProductBriefPayload {
  name: string
  category?: string
  brand?: string
  tagline?: string
  features: string[]
  seo_keywords: string[]
  tone?: string
  audience?: string
  language?: string
  additional_notes?: string
  length?: LengthOption
}

interface ProductFormState {
  name: string
  category: string
  brand: string
  tagline: string
  audience: string
  tone: string
  language: string
  length: LengthOption
  additionalNotes: string
}

const DEFAULT_FORM_STATE: ProductFormState = {
  name: '',
  category: '',
  brand: '',
  tagline: '',
  audience: '',
  tone: 'balanced',
  language: 'English',
  length: 'detailed',
  additionalNotes: '',
}

const LENGTH_LABELS: Record<LengthOption, string> = {
  short: 'Short spotlight',
  standard: 'Standard PDP (2-3 paragraphs)',
  detailed: 'Detailed storytelling',
}

const parseLines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const parseKeywords = (value: string): string[] =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const optional = (value: string): string | undefined => {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const sortByUpdated = (items: Product[]): Product[] =>
  [...items].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

export function ProductDescriptionManager() {
  const [formState, setFormState] = useState<ProductFormState>(DEFAULT_FORM_STATE)
  const [featuresText, setFeaturesText] = useState('')
  const [keywordsText, setKeywordsText] = useState('')
  const [description, setDescription] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
    return
  }, [notification])

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  )

  const buildBriefPayload = (): ProductBriefPayload => ({
    name: formState.name.trim(),
    category: optional(formState.category),
    brand: optional(formState.brand),
    tagline: optional(formState.tagline),
    audience: optional(formState.audience),
    tone: optional(formState.tone) || 'balanced',
    language: optional(formState.language) || 'English',
    length: formState.length,
    additional_notes: optional(formState.additionalNotes),
    features: parseLines(featuresText),
    seo_keywords: parseKeywords(keywordsText),
  })

  const resetForm = () => {
    setFormState(DEFAULT_FORM_STATE)
    setFeaturesText('')
    setKeywordsText('')
    setDescription('')
    setEditingProductId(null)
  }

  const fetchProducts = async () => {
    setIsLoadingProducts(true)
    setError(null)
    try {
      const response = await fetch(API_ENDPOINTS.PRODUCTS)
      if (!response.ok) {
        const message = `Failed to load products (${response.status})`
        throw new Error(message)
      }

      const data: Product[] = await response.json()
      const ordered = sortByUpdated(data)
      setProducts(ordered)

      if (!selectedProductId && ordered.length > 0) {
        setSelectedProductId(ordered[0].id)
      } else if (
        selectedProductId &&
        !ordered.some((product) => product.id === selectedProductId)
      ) {
        setSelectedProductId(ordered[0]?.id ?? null)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error loading products'
      setError(message)
    } finally {
      setIsLoadingProducts(false)
    }
  }

  const handleGenerateDescription = async () => {
    if (!formState.name.trim()) {
      setError('Product name is required before generating a description.')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const payload = buildBriefPayload()
      const response = await fetch(API_ENDPOINTS.GENERATE_DESCRIPTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const message =
          errorBody?.detail ||
          (response.status === 503
            ? 'Writer AI generation is unavailable. Configure WRITER_API_KEY on the backend.'
            : `Failed to generate description (${response.status})`)
        throw new Error(message)
      }

      const data: { description: string } = await response.json()
      setDescription(data.description.trim())
      setNotification('Generated new product description with Writer AI.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error generating description'
      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveProduct = async () => {
    if (!formState.name.trim()) {
      setError('Product name is required.')
      return
    }

    const payload = buildBriefPayload()
    const trimmedDescription = description.trim()
    const shouldAutoGenerate = trimmedDescription.length === 0

    setIsSaving(true)
    setError(null)

    try {
      if (!editingProductId) {
        const createPayload: Record<string, unknown> = {
          ...payload,
          auto_generate: shouldAutoGenerate,
        }
        if (!shouldAutoGenerate) {
          createPayload.description = trimmedDescription
        }

        const response = await fetch(API_ENDPOINTS.PRODUCTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}))
          const message = errorBody?.detail || `Failed to save product (${response.status})`
          throw new Error(message)
        }

        const product: Product = await response.json()
        setProducts((prev) => sortByUpdated([product, ...prev.filter((p) => p.id !== product.id)]))
        setSelectedProductId(product.id)
        setNotification('Product saved successfully.')
        resetForm()
      } else {
        const updatePayload: Record<string, unknown> = {
          ...payload,
          regenerate_description: shouldAutoGenerate,
        }
        if (!shouldAutoGenerate) {
          updatePayload.description = trimmedDescription
        }

        const response = await fetch(API_ENDPOINTS.PRODUCT(editingProductId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}))
          const message = errorBody?.detail || `Failed to update product (${response.status})`
          throw new Error(message)
        }

        const product: Product = await response.json()
        setProducts((prev) => sortByUpdated([product, ...prev.filter((p) => p.id !== product.id)]))
        setSelectedProductId(product.id)
        setNotification('Product updated successfully.')
        setEditingProductId(product.id)
        setFormState({
          name: product.name,
          category: product.category ?? '',
          brand: product.brand ?? '',
          tagline: product.tagline ?? '',
          audience: product.audience ?? '',
          tone: product.tone ?? 'balanced',
          language: product.language ?? 'English',
          length: (product.length as LengthOption) || 'detailed',
          additionalNotes: product.additional_notes ?? '',
        })
        setFeaturesText(product.features.join('\n'))
        setKeywordsText(product.seo_keywords.join(', '))
        setDescription(product.description)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error saving product'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    setDeletingProductId(productId)
    setError(null)

    try {
      const response = await fetch(API_ENDPOINTS.PRODUCT(productId), {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const message = errorBody?.detail || `Failed to delete product (${response.status})`
        throw new Error(message)
      }

      setProducts((prev) => {
        const next = prev.filter((product) => product.id !== productId)
        if (selectedProductId === productId) {
          setSelectedProductId(next[0]?.id ?? null)
        }
        return next
      })
      if (editingProductId === productId) {
        resetForm()
      }
      setNotification('Product removed successfully.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error deleting product'
      setError(message)
    } finally {
      setDeletingProductId(null)
    }
  }

  const handleEditProduct = (product: Product) => {
    setEditingProductId(product.id)
    setSelectedProductId(product.id)
    setFormState({
      name: product.name,
      category: product.category ?? '',
      brand: product.brand ?? '',
      tagline: product.tagline ?? '',
      audience: product.audience ?? '',
      tone: product.tone ?? 'balanced',
      language: product.language ?? 'English',
      length: (product.length as LengthOption) || 'detailed',
      additionalNotes: product.additional_notes ?? '',
    })
    setFeaturesText(product.features.join('\n'))
    setKeywordsText(product.seo_keywords.join(', '))
    setDescription(product.description)
    setNotification(`Loaded “${product.name}” into the editor.`)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Product Description Studio</h1>
              <p className="text-sm text-slate-500">
                Generate, refine, and manage e-commerce PDP copy with Writer AI
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchProducts} disabled={isLoadingProducts}>
            {isLoadingProducts ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Refreshing
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh list
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notification && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notification}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingProductId ? 'Edit product brief' : 'New product brief'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Provide merchandising details to guide description generation.
                  </p>
                </div>
                {editingProductId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" /> Start new product
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Product name *</label>
                  <Input
                    value={formState.name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="AuroraGlow Smart Lamp"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Category</label>
                  <Input
                    value={formState.category}
                    onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value }))}
                    placeholder="Home Lighting"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Brand</label>
                  <Input
                    value={formState.brand}
                    onChange={(e) => setFormState((prev) => ({ ...prev, brand: e.target.value }))}
                    placeholder="Aurora"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Tagline</label>
                  <Input
                    value={formState.tagline}
                    onChange={(e) => setFormState((prev) => ({ ...prev, tagline: e.target.value }))}
                    placeholder="Light that follows your rhythm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Tone</label>
                  <Input
                    value={formState.tone}
                    onChange={(e) => setFormState((prev) => ({ ...prev, tone: e.target.value }))}
                    placeholder="Balanced, inspiring, luxurious"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Target audience</label>
                  <Input
                    value={formState.audience}
                    onChange={(e) => setFormState((prev) => ({ ...prev, audience: e.target.value }))}
                    placeholder="Design-conscious homeowners"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Language</label>
                  <Input
                    value={formState.language}
                    onChange={(e) => setFormState((prev) => ({ ...prev, language: e.target.value }))}
                    placeholder="English"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Length profile</label>
                  <select
                    value={formState.length}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, length: e.target.value as LengthOption }))
                    }
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {Object.entries(LENGTH_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Key features (one per line)</label>
                  <Textarea
                    value={featuresText}
                    onChange={(e) => setFeaturesText(e.target.value)}
                    placeholder={'Adaptive brightness control\nVoice assistant integration\nEnergy-saving LED core'}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">SEO keywords (comma or line separated)</label>
                  <Textarea
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    placeholder={'smart lamp, ambient lighting, voice control'}
                    className="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="space-y-1.5 mt-6">
                <label className="text-sm font-medium text-slate-700">Additional notes for the writer</label>
                <Textarea
                  value={formState.additionalNotes}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, additionalNotes: e.target.value }))
                  }
                  placeholder="Highlight sustainable materials and low energy consumption."
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Product description</h3>
                  <p className="text-sm text-slate-500">
                    Generate with AI or fine-tune manually before saving to your library.
                  </p>
                </div>
                {editingProductId && (
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    Editing existing product
                  </span>
                )}
              </div>

              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Click “Generate description” or paste your own copy here."
                className="min-h-[220px]"
              />

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {description.trim().length === 0
                    ? 'No description yet — save to auto-generate with your current brief.'
                    : `${description.trim().split(/\s+/).length} words in draft`}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateDescription}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" /> Generate description
                      </>
                    )}
                  </Button>
                  <Button type="button" onClick={handleSaveProduct} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {editingProductId ? 'Update product' : 'Save product'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Saved products</h3>
                <span className="text-xs text-slate-500">
                  {products.length} item{products.length === 1 ? '' : 's'}
                </span>
              </div>

              {isLoadingProducts ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading products…
                </div>
              ) : products.length === 0 ? (
                <div className="text-sm text-slate-500">
                  No saved PDP entries yet. Generate a description and click “Save product” to get
                  started.
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {products.map((product) => {
                    const isSelected = product.id === selectedProductId
                    return (
                      <button
                        key={product.id}
                        onClick={() => setSelectedProductId(product.id)}
                        className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-slate-900 truncate">
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {product.category ?? 'General'} • Updated{' '}
                              {new Date(product.updated_at).toLocaleString()}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">
                            {product.length ?? 'detailed'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{selectedProduct.name}</h3>
                    <p className="text-xs text-slate-500">
                      Created {new Date(selectedProduct.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditProduct(selectedProduct)}
                    >
                      <PencilLine className="w-4 h-4 mr-2" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteProduct(selectedProduct.id)}
                      disabled={deletingProductId === selectedProduct.id}
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      {deletingProductId === selectedProduct.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-slate-700">
                  {selectedProduct.tagline && (
                    <p className="italic text-slate-600">“{selectedProduct.tagline}”</p>
                  )}
                  <div className="bg-slate-50 border border-slate-100 rounded-md p-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {selectedProduct.description}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {selectedProduct.features.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          Key features
                        </p>
                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                          {selectedProduct.features.map((feature, index) => (
                            <li key={`${selectedProduct.id}-feature-${index}`}>{feature}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedProduct.seo_keywords.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          SEO keywords
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedProduct.seo_keywords.map((keyword, index) => (
                            <span
                              key={`${selectedProduct.id}-keyword-${index}`}
                              className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                      <div>
                        <span className="font-medium text-slate-600">Tone:</span>{' '}
                        {selectedProduct.tone ?? 'balanced'}
                      </div>
                      <div>
                        <span className="font-medium text-slate-600">Audience:</span>{' '}
                        {selectedProduct.audience ?? 'Shoppers'}
                      </div>
                      <div>
                        <span className="font-medium text-slate-600">Language:</span>{' '}
                        {selectedProduct.language ?? 'English'}
                      </div>
                      <div>
                        <span className="font-medium text-slate-600">Length:</span>{' '}
                        {selectedProduct.length ?? 'detailed'}
                      </div>
                    </div>
                    {selectedProduct.additional_notes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          Additional notes
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {selectedProduct.additional_notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
