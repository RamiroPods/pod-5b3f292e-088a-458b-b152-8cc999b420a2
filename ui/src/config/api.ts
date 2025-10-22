const getApiUrl = (): string => {
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_API_URL || '';
  }

  return import.meta.env.VITE_API_URL || 'http://localhost:8000';
};

export const API_BASE_URL = getApiUrl();

const prefix = (path: string) => `${API_BASE_URL}${path}`;

export const API_ENDPOINTS = {
  PRODUCTS: prefix('/api/products'),
  PRODUCT: (id: string) => prefix(`/api/products/${id}`),
  GENERATE_DESCRIPTION: prefix('/api/products/generate'),
  HEALTH: prefix('/health'),
  INFO: prefix('/api/info'),
} as const;