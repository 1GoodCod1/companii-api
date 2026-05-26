export const technicianWithUser = {
  include: {
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
  },
} as const;
