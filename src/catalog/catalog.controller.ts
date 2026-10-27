import { Controller, Get, Header } from '@nestjs/common';
import { CatalogService } from './catalog.service';

const CACHE = 'public, max-age=300, stale-while-revalidate=600';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Pieces, styles, colors, lengths, symbols, quick chips, guiding questions and public rules. */
  @Get('catalog')
  @Header('Cache-Control', CACHE)
  getCatalog() {
    return this.catalog.getCatalog();
  }

  /** "From story to piece" gallery. */
  @Get('stories')
  @Header('Cache-Control', CACHE)
  getStories() {
    return this.catalog.getStories();
  }

  @Get('faqs')
  @Header('Cache-Control', CACHE)
  getFaqs() {
    return this.catalog.getFaqs();
  }

  @Get('shipping-zones')
  @Header('Cache-Control', CACHE)
  getShippingZones() {
    return this.catalog.getShippingZones();
  }
}
