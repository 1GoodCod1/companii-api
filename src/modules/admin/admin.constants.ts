export const companyListInclude = {
  city: true,
  category: true,
  owner: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  subscription: { include: { plan: true } },
} as const;

export const companyDetailInclude = {
  city: true,
  category: true,
  owner: {
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
    },
  },
  subscription: { include: { plan: true } },
  galleryImages: { orderBy: { sortOrder: 'asc' as const } },
  documents: { orderBy: { createdAt: 'desc' as const } },
  _count: {
    select: {
      members: true,
      customers: true,
      interventions: true,
      reviews: true,
      services: true,
    },
  },
} as const;
