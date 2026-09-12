-- Catalogue integrity checks; no clinical records written.
begin;
do $$begin
 if (select count(*) from dental_medicine_references)<>26 then raise exception 'Missing catalogue entries';end if;
 if exists(select 1 from dental_medicine_references where category in ('Pediatric liquids','Emergency') and (default_dose<>'' or frequency<>'')) then raise exception 'Patient-specific medicines must not carry blanket doses';end if;
 if exists(select 1 from dental_medicine_references where trim(instructions)='' or source_url not like 'https://%') then raise exception 'Missing administration source';end if;
 if (select route from dental_medicine_references where code='emergency-adrenaline-1')<>'IM' or (select route from dental_medicine_references where code='emergency-midazolam-5')<>'Buccal' then raise exception 'Emergency route mismatch';end if;
 if (select strength from dental_medicine_references where code='pantop-d-20-10')<>'20 mg + 10 mg' or (select strength from dental_medicine_references where code='pantop-d-sr-40-30')<>'40 mg + 30 mg SR' then raise exception 'Pantop formulation mismatch';end if;
 if (select instructions from dental_medicine_references where code='diclofenac-50') not like '%food%' then raise exception 'Missing meal instructions';end if;
end $$;
rollback;
