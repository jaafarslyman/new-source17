---
name: Property, staff, and service workflow rules
description: User-defined domain rules for keeping property, contact, staff, and service records connected.
---

Property ownership links to a contact and is preserved in Contacts. Property setup follows identity/type, location, mapping, ownership, then details. Multifamily and apartment properties must have at least two units. For these types, map owners to units instead of collecting property-level percentages; whole-unit assignments need no percentage, while multiple owners sharing one unit must total 100% for that unit. Unit creation inherits the map and locks those owners. For other ownership splits, percentages must total 100%. Occupancy distinguishes rented, owner-occupied, and not rented at the property or unit level as appropriate.

An existing contact can be selected only once among the owner rows for the same property or unit; hide contacts selected by other rows while preserving the current row’s selection.

Staff fields and assignments depend on role. Executives such as the CEO do not need a managed-property portfolio. Maintenance staff record the work type and trade specialties, rather than being assigned a fixed portfolio. Property assignments are for property-management roles.

Services may be assigned to multiple eligible existing staff members or marked “Done by the company.” Company-wide delivery is distinct from assigning an individual and from customer service contracts.

**Why:** the user specified these workflow rules for the product, including preventing duplicate owner assignments, requiring at least two units for multifamily and apartment properties, and distinguishing owner occupancy from rental.

**How to apply:** keep Properties, Contacts, Staff, and Services aligned when changing forms, relationship persistence, or assignment workflows. Reject unit counts below two for multifamily/apartment properties. Exclude already-selected owners from sibling owner dropdowns without hiding a row’s own saved choice.
