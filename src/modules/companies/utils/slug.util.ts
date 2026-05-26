export function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
    'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't',
  };
  return text
    .split('')
    .map((char) => {
      const lower = char.toLowerCase();
      if (map[lower] !== undefined) {
        return char === char.toUpperCase() ? map[lower].toUpperCase() : map[lower];
      }
      return char;
    })
    .join('');
}

export function slugifyCompanyName(name: string): string {
  const transliterated = transliterate(name);
  let slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  if (!slug) {
    slug = 'company-' + Math.random().toString(36).substring(2, 8);
  }
  return slug;
}
