export type Policy = { title: string; lead: string; sections: { title: string; body: string }[] };
export const policies: Record<string, Policy> = {
  'shipping-policy': {
    title: 'Shipping Policy',
    lead: 'What to check before your Kurti begins its journey.',
    sections: [
      {
        title: 'Delivery availability',
        body: 'Delivery depends on the destination PIN code and the pieces in your bag. Enter a complete Indian delivery address at checkout so that serviceability and any delivery estimate can be checked before payment.',
      },
      {
        title: 'Shipping charges',
        body: 'A shipping charge is separate from the price of a Kurti. Where a charge is known, it appears in the bag. If it depends on your address, it is calculated at checkout. Review the final payable total before continuing to prepaid payment.',
      },
      {
        title: 'Dispatch and delivery',
        body: 'An order is confirmed only after payment has been verified. An estimated arrival is not a guaranteed delivery date. Carrier availability, public holidays and local conditions can affect transit times.',
      },
      {
        title: 'Following a shipment',
        body: 'Use Track order with the mobile number entered at checkout. A carrier link appears once shipment details are available. A confirmed order may not yet have a tracking link while it is being prepared.',
      },
      {
        title: 'Address changes or delivery issues',
        body: 'Check the recipient name, building or house number, locality, city, state and PIN code before payment. If you notice an error or a parcel arrives damaged, visit Customer care with your order reference. Address changes may not be possible once a shipment is underway.',
      },
    ],
  },
  'returns-refunds': {
    title: 'Returns & Refunds',
    lead: 'A guide to checking eligibility and asking about a purchase.',
    sections: [
      {
        title: 'Before ordering',
        body: 'Review the fit, measurements, fabric description and any return conditions displayed for the specific Kurti. Eligibility, the request window and return charges depend on the terms supplied for the purchase. Do not assume that a return or exchange is free or automatic.',
      },
      {
        title: 'If a piece is incorrect, damaged or defective',
        body: 'Keep the item, its tags, invoice and packaging. Note the issue and retain clear photographs if they would help explain it. Visit Customer care with your order reference before sending the item back; do not post it to an unconfirmed address.',
      },
      {
        title: 'Requesting a return',
        body: 'Identify the piece, size and reason for your request. The available return route, condition requirements, collection or postage arrangements and any applicable costs should be confirmed before you dispatch a parcel. Keep your return tracking details until the request is resolved.',
      },
      {
        title: 'Refunds and payment questions',
        body: 'A refund is not completed simply because a request was submitted. Where a refund is approved, the amount, method and status are confirmed against the original payment. Bank or payment-provider processing may affect when a credit appears. Never share a card PIN, UPI PIN or one-time password to obtain a refund.',
      },
      {
        title: 'Your rights',
        body: 'These guidelines do not limit rights available under applicable consumer law. For a payment that appears to have been debited without an order confirmation, check order tracking before paying again.',
      },
    ],
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    lead: 'How your shopping information is used, and what stays on your device.',
    sections: [
      {
        title: 'Shopping without an account',
        body: 'You can explore the collection, save favourites and use guest checkout without registering. Your bag, wishlist, recently viewed pieces and sort preference use storage in this browser. They are not an account profile and do not automatically follow you to another device.',
      },
      {
        title: 'Delivery and order information',
        body: 'Checkout uses the recipient name, mobile number, address, city, state and PIN code to check delivery, calculate the order total and fulfil a purchase. When you request a final quote, those details are sent to the order service. An actual order is recorded by the order system, not by the browser bag.',
      },
      {
        title: 'Optional address storage',
        body: 'A delivery address is saved locally only if you choose the save-address option. Saved addresses expire after 30 days and are removed when the store next reads expired data. Anyone with access to that browser may be able to see saved shopping information. Do not save an address on a shared device.',
      },
      {
        title: 'Payments and tracking',
        body: 'Prepaid payment details are entered with the payment provider. This storefront does not save card numbers, UPI PINs, authentication codes or payment secrets in browser storage. Tracking sends the checkout mobile number to the order service and displays limited order and shipment information.',
      },
      {
        title: 'Service providers and retention',
        body: 'Order information is used by the services needed for payment, fulfilment, delivery and customer support. Order records may need to be retained for transaction handling and legal obligations. Removing local shopping data does not remove those records.',
      },
      {
        title: 'Optional communications',
        body: 'Marketing emails require a separate opt-in when subscriptions are open. Buying a Kurti does not subscribe you. Use the unsubscribe option in a marketing email to stop those messages. Information sent in a support enquiry is used to respond to that enquiry.',
      },
      {
        title: 'Questions about your information',
        body: 'Visit Customer care for the available contact channels and help with privacy requests. Do not include payment credentials or sensitive identity documents in an enquiry.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    lead: 'The essentials for browsing and purchasing through PARADELLE.',
    sections: [
      {
        title: 'Using the storefront',
        body: 'PARADELLE is a Kurti-only storefront. Browsing, wishlists and checkout do not require a customer account. Provide accurate delivery and contact details when placing an order and use order tracking only for your own purchases.',
      },
      {
        title: 'Editorial imagery and product listings',
        body: 'Campaigns and style studies illustrate the brand’s point of view; they are not listings or promises of stock. Purchasable pieces have their own product pages, size options and current prices. Colours can look different across screens and lighting conditions.',
      },
      {
        title: 'Prices and availability',
        body: 'Prices are displayed in Indian rupees. A reference MRP or reduction is shown only when supported by the product listing. Adding a piece to a bag or wishlist does not reserve it. Review the latest size availability, delivery charge and final total before paying.',
      },
      {
        title: 'Prepaid guest orders',
        body: 'Only prepaid checkout is offered. Payment methods depend on the provider options available for the transaction. A redirect, a browser notification or a debit message alone does not confirm an order. Confirmation is shown only after the order service verifies payment.',
      },
      {
        title: 'Delivery, returns and concerns',
        body: 'Read the shipping policy, the return and refund guidance and any product-specific conditions before purchase. If a payment is interrupted, check the order status before retrying. Keep your order reference for customer-care enquiries.',
      },
      {
        title: 'Responsible use',
        body: 'Do not misuse the storefront, interfere with its operation, or attempt to obtain another customer’s information. Brand and campaign materials are provided to help you browse PARADELLE; their publication does not grant a licence for commercial reuse.',
      },
      {
        title: 'Applicable protections',
        body: 'Nothing here excludes consumer rights that cannot be excluded under applicable law. Keep the order details and terms presented for your purchase. Questions about a specific order should be directed to Customer care.',
      },
    ],
  },
};
