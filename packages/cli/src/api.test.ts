import { expectTypeOf, it } from 'vitest';

import {
  adaptBrokerFile,
  adaptBrokerSource,
  inspectBrokerFile,
  normalizeBrokerActivities,
  normalizeBrokerFile,
  normalizeBrokerSource,
  serializeJson,
  type AdaptedBrokerSource,
  type InspectionReport,
  type NormalizationEnvelope,
} from './api.js';

it('publishes one high-level orchestration boundary without internal path imports', () => {
  expectTypeOf(adaptBrokerSource).toBeFunction();
  expectTypeOf(adaptBrokerFile).toBeFunction();
  expectTypeOf(inspectBrokerFile).toBeFunction();
  expectTypeOf(normalizeBrokerSource).toBeFunction();
  expectTypeOf(normalizeBrokerFile).toBeFunction();
  expectTypeOf(normalizeBrokerActivities).toBeFunction();
  expectTypeOf(serializeJson).toBeFunction();

  expectTypeOf<ReturnType<typeof adaptBrokerSource>>().toEqualTypeOf<AdaptedBrokerSource>();
  expectTypeOf<ReturnType<typeof normalizeBrokerSource>>().toEqualTypeOf<NormalizationEnvelope>();
  expectTypeOf<Awaited<ReturnType<typeof inspectBrokerFile>>>().toEqualTypeOf<InspectionReport>();
});
