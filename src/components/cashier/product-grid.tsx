'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import Image from 'next/image';

interface Product {
  id: string;
  product_name: string;
  category: 'Meals' | 'Drinks&Juices' | 'Specials';
  product_price: number;
  image_url: string | null;
  is_active: boolean;
  branch_id?: string;
}

interface ProductGridProps {
  products: Product[];
  onAddToOrder: (product: Product) => void;
}

const CATEGORIES = ['All', 'Meals', 'Drinks&Juices', 'Specials'] as const;

export function ProductGrid({ products, onAddToOrder }: ProductGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.product_name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'All' || product.category === selectedCategory;
      return matchesSearch && matchesCategory && product.is_active;
    });
  }, [products, searchQuery, selectedCategory]);

  // Get product counts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0 };
    products.forEach((product) => {
      if (product.is_active) {
        counts.All = (counts.All || 0) + 1;
        counts[product.category] = (counts[product.category] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Meals':
        return 'bg-orange-500';
      case 'Drinks&Juices':
        return 'bg-blue-500';
      case 'Specials':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-0"
        />
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category)}
            className="gap-2"
          >
            {category}
            <Badge variant="secondary" className="ml-1">
              {categoryCounts[category] || 0}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center">
              No products found
              {searchQuery && (
                <span className="block mt-1">Try a different search term</span>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer rounded-lg border bg-card text-card-foreground shadow-sm"
              onClick={() => onAddToOrder(product)}
            >
              {/* Product Image - Top */}
              <div className="relative aspect-square bg-muted">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.product_name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <span className="text-5xl">🍽️</span>
                  </div>
                )}
              </div>

              {/* Product Info - Below image */}
              <div className="p-2 space-y-0.5">
                <h3 className="font-semibold text-base line-clamp-2">
                  {product.product_name}
                </h3>
                <p className="text-sm font-medium text-primary">
                  Ksh {product.product_price.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
