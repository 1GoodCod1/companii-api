import { escapeHtml, escapeHtmlMultiline, sanitizeUrl } from './types';

describe('Email Templates Utility Helpers', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters correctly', () => {
      const input = '<script>alert("XSS & Bad things");</script> \'quote\'';
      const expected = '&lt;script&gt;alert(&quot;XSS &amp; Bad things&quot;);&lt;/script&gt; &#39;quote&#39;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should handle null and undefined safely', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should convert and escape other primitives safely', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(true)).toBe('true');
    });
  });

  describe('escapeHtmlMultiline', () => {
    it('should escape HTML characters and convert newlines to <br />', () => {
      const input = 'Hello <World>!\nLine 2 & Done.';
      const expected = 'Hello &lt;World&gt;!<br />Line 2 &amp; Done.';
      expect(escapeHtmlMultiline(input)).toBe(expected);
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow safe http and https URLs', () => {
      expect(sanitizeUrl('https://example.com/path?foo=bar&baz=1')).toBe('https://example.com/path?foo=bar&amp;baz=1');
      expect(sanitizeUrl('http://test.local')).toBe('http://test.local');
    });

    it('should allow relative path URLs starting with /', () => {
      expect(sanitizeUrl('/portal/inbox')).toBe('/portal/inbox');
    });

    it('should block unsafe protocols and return safe fallback', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('#unsafe-link');
      expect(sanitizeUrl('data:text/html,<script>')).toBe('#unsafe-link');
      expect(sanitizeUrl('vbscript:msgbox("hello")')).toBe('#unsafe-link');
    });

    it('should handle null, empty, or undefined URLs by returning #', () => {
      expect(sanitizeUrl(null)).toBe('#');
      expect(sanitizeUrl(undefined)).toBe('#');
      expect(sanitizeUrl('')).toBe('#');
    });
  });
});
