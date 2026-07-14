export const realtimeChannels = {
  guestOrder(orderCode: string) {
    return `order-${orderCode}`;
  },

  kitchen(hotelId: string) {
    return `kitchen-${hotelId}`;
  },

  kitchenGlobal() {
    return 'kitchen-global';
  },

  inventory(hotelId: string) {
    return `inventory-${hotelId}`;
  },

  inventoryGlobal() {
    return 'inventory-global';
  },

  serviceRequests(hotelId: string) {
    return `service-requests-${hotelId}`;
  },

  serviceRequestsGlobal() {
    return 'service-requests-global';
  },

  guestServiceRequests(guestSessionId: string) {
    return `guest-service-requests-${guestSessionId}`;
  },

  dashboardHotelOrders(hotelId: string) {
    return `dashboard-hotel-${hotelId}-orders`;
  },

  dashboardGlobalOrders() {
    return 'dashboard-global-orders';
  },

  dashboardHotelInventory(hotelId: string) {
    return `dashboard-hotel-${hotelId}-inventory`;
  },

  dashboardGlobalInventory() {
    return 'dashboard-global-inventory';
  },
};