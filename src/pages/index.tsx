import Discover from '@app/components/Discover';
import { useUser } from '@app/hooks/useUser';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const Index: NextPage = () => {
  const router = useRouter();
  const { user } = useUser();
  const startPage = user?.settings?.startPage;
  const redirecting = Boolean(startPage && startPage !== '/');

  useEffect(() => {
    if (redirecting && startPage) {
      router.replace(startPage);
    }
  }, [redirecting, startPage, router]);

  if (redirecting) {
    return null;
  }

  return <Discover />;
};

export default Index;
