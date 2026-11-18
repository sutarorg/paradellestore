import StoreLayout from './(store)/layout';
import MissingPage from './(store)/not-found';
export default function NotFound() {
  return (
    <StoreLayout>
      <MissingPage />
    </StoreLayout>
  );
}
